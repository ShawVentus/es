# src/server/domain/adapters/ccxt_adapter.py
"""CCXT Adapter for cryptocurrency data using exchange APIs.

Uses ccxt.async_support for asynchronous exchange interactions.
Provides high-quality OHLCV data suitable for technical analysis.
"""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set

import ccxt.async_support as ccxt
from src.server.domain.adapters.base import BaseDataAdapter
from src.server.domain.types import (
    AdapterCapability,
    Asset,
    AssetPrice,
    AssetSearchQuery,
    AssetSearchResult,
    AssetType,
    DataSource,
    Exchange,
)
from src.server.utils.logger import logger


class CCXTAdapter(BaseDataAdapter):
    name = "ccxt"

    def __init__(self, cache, default_exchange_id: str = "binance", proxy_url: str = None):
        super().__init__(DataSource.CRYPTO)
        self.cache = cache
        self.default_exchange_id = default_exchange_id
        self._exchange_instances: Dict[str, ccxt.Exchange] = {}
        self.logger = logger
        self.proxy_url = proxy_url
        if self.proxy_url:
            self.logger.info(f"✅ CCXTAdapter configured with proxy: {self.proxy_url}")

    async def _get_exchange(self, exchange_id: str) -> ccxt.Exchange:
        """Get or create an exchange instance."""
        if exchange_id in self._exchange_instances:
            return self._exchange_instances[exchange_id]

        if exchange_id not in ccxt.exchanges:
            raise ValueError(f"Exchange {exchange_id} not supported by CCXT")

        exchange_class = getattr(ccxt, exchange_id)
        config = {
            "enableRateLimit": True,
            "options": {"defaultType": "spot"}  # Default to spot for data fetching
        }
        
        if self.proxy_url:
            config["proxies"] = {
                "http": self.proxy_url,
                "https": self.proxy_url,
            }

        exchange = exchange_class(config)
        
        # Load markets to ensure we can validate symbols
        await exchange.load_markets()
        
        self._exchange_instances[exchange_id] = exchange
        return exchange

    async def close(self):
        """Close all exchange connections."""
        for exchange in self._exchange_instances.values():
            await exchange.close()
        self._exchange_instances.clear()

    def get_capabilities(self) -> List[AdapterCapability]:
        """Declare CCXT adapter's capabilities."""
        return [
            AdapterCapability(
                asset_type=AssetType.CRYPTO,
                exchanges={
                    Exchange.CRYPTO,
                    Exchange.BINANCE,
                    Exchange.OKX,
                    Exchange.COINBASE,
                    Exchange.KRAKEN,
                },
            ),
        ]

    def _exchange_id_for_ticker(self, internal_ticker: str) -> str:
        """Map internal exchange prefixes to CCXT exchange ids."""
        if ":" not in internal_ticker:
            return self.default_exchange_id

        exchange = internal_ticker.split(":", 1)[0].upper()
        return {
            "BINANCE": "binance",
            "OKX": "okx",
            "COINBASE": "coinbase",
            "KRAKEN": "kraken",
            "CRYPTO": self.default_exchange_id,
        }.get(exchange, self.default_exchange_id)

    def convert_to_source_ticker(self, internal_ticker: str) -> str:
        """Convert internal crypto tickers to CCXT pair format.

        Supported examples:
        - CRYPTO:BTC -> BTC/USDT
        - CRYPTO:BTC-USD -> BTC/USDT
        - BINANCE:BTCUSDT -> BTC/USDT
        - BINANCE:ETH/USDT -> ETH/USDT
        """
        if ":" in internal_ticker:
            symbol_part = internal_ticker.split(":", 1)[1]
        else:
            symbol_part = internal_ticker

        symbol = symbol_part.upper().replace("-", "/")
        if "/" in symbol:
            base, quote = symbol.split("/", 1)
            if quote == "USD":
                quote = "USDT"
            return f"{base}/{quote}"

        # Split common concatenated pairs such as BTCUSDT, ETHUSDC, BTCUSD.
        for quote in ("USDT", "USDC", "USD", "BTC", "ETH"):
            if symbol.endswith(quote) and len(symbol) > len(quote):
                base = symbol[: -len(quote)]
                if quote == "USD":
                    quote = "USDT"
                return f"{base}/{quote}"

        # If it is just BTC/ETH/etc., assume the default spot quote.
        return f"{symbol}/USDT"

    def convert_to_internal_ticker(
        self, source_ticker: str, default_exchange: Optional[str] = None
    ) -> str:
        """Convert BTC/USDT to CRYPTO:BTC-USD."""
        symbol = source_ticker.replace("/", "-")
        if symbol.endswith("-USDT"):
            symbol = symbol.replace("-USDT", "-USD")
        return f"CRYPTO:{symbol}"

    async def get_asset_info(self, ticker: str) -> Optional[Asset]:
        """Fetch asset info (limited support in CCXT, mainly market info)."""
        # CCXT is not great for asset metadata (description, website, etc.)
        # We rely on CryptoAdapter (CoinGecko) for that.
        # This implementation returns basic market info.
        
        exchange = await self._get_exchange(self._exchange_id_for_ticker(ticker))
        symbol = self.convert_to_source_ticker(ticker)
        
        if symbol not in exchange.markets:
            return None
            
        market = exchange.markets[symbol]
        
        return Asset(
            ticker=ticker,
            asset_type=AssetType.CRYPTO,
            name=market.get("base", "") + " " + market.get("quote", ""),
            market_info={
                "exchange": self.default_exchange_id.upper(),
                "currency": market.get("quote", "USD"),
                "market_status": "OPEN"
            },
            source_mappings={DataSource.CRYPTO: symbol},
            properties={
                "base": market.get("base"),
                "quote": market.get("quote"),
                "spot": market.get("spot"),
                "future": market.get("future"),
            }
        )

    async def get_real_time_price(self, ticker: str) -> Optional[AssetPrice]:
        """Fetch current price using CCXT fetch_ticker."""
        cache_key = f"ccxt:price:{ticker}"
        cached = await self.cache.get(cache_key)
        if cached:
            return AssetPrice.from_dict(cached)

        exchange = await self._get_exchange(self._exchange_id_for_ticker(ticker))
        symbol = self.convert_to_source_ticker(ticker)

        try:
            ticker_data = await exchange.fetch_ticker(symbol)
            
            price = AssetPrice(
                ticker=ticker,
                price=Decimal(str(ticker_data["last"])),
                currency="USD", # Assuming normalized to USD/USDT
                timestamp=datetime.now(timezone.utc),
                volume=Decimal(str(ticker_data.get("baseVolume", 0))),
                open_price=Decimal(str(ticker_data.get("open", 0))),
                high_price=Decimal(str(ticker_data.get("high", 0))),
                low_price=Decimal(str(ticker_data.get("low", 0))),
                close_price=Decimal(str(ticker_data.get("close", 0))),
                change=Decimal(str(ticker_data.get("change", 0))),
                change_percent=Decimal(str(ticker_data.get("percentage", 0))),
                source=DataSource.CRYPTO
            )
            
            await self.cache.set(cache_key, price.to_dict(), ttl=10) # Short TTL for real-time
            return price
            
        except Exception as e:
            self.logger.warning(f"CCXT fetch_ticker failed for {symbol}: {e}")
            return None

    async def get_historical_prices(
        self,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d",
    ) -> List[AssetPrice]:
        """Fetch OHLCV data using CCXT fetch_ohlcv."""
        # Map interval to CCXT timeframe
        timeframe_map = {
            "1d": "1d",
            "1h": "1h",
            "15m": "15m",
            "5m": "5m",
            "1m": "1m",
            "1wk": "1w",
            "1mo": "1M"
        }
        timeframe = timeframe_map.get(interval, "1d")
        
        start_ts = int(start_date.timestamp() * 1000)
        end_ts = int(end_date.timestamp() * 1000)
        
        cache_key = f"ccxt:history:{ticker}:{start_ts}:{end_ts}:{timeframe}"
        cached = await self.cache.get(cache_key)
        if cached:
            return [AssetPrice.from_dict(item) for item in cached]

        exchange = await self._get_exchange(self._exchange_id_for_ticker(ticker))
        symbol = self.convert_to_source_ticker(ticker)

        try:
            # fetch_ohlcv(symbol, timeframe, since, limit, params)
            # Note: limit might be needed if range is large, but for now simple fetch
            ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, since=start_ts)
            
            prices = []
            for candle in ohlcv:
                # [timestamp, open, high, low, close, volume]
                ts, o, h, l, c, v = candle
                
                if ts > end_ts:
                    break
                    
                prices.append(AssetPrice(
                    ticker=ticker,
                    timestamp=datetime.fromtimestamp(ts / 1000, tz=timezone.utc),
                    price=Decimal(str(c)),
                    open_price=Decimal(str(o)),
                    high_price=Decimal(str(h)),
                    low_price=Decimal(str(l)),
                    close_price=Decimal(str(c)),
                    volume=Decimal(str(v)),
                    currency="USD",
                    source=DataSource.CRYPTO
                ))
                
            await self.cache.set(cache_key, [p.to_dict() for p in prices], ttl=300)
            return prices

        except Exception as e:
            self.logger.error(f"CCXT fetch_ohlcv failed for {symbol}: {e}")
            return []

    async def search_assets(self, query: AssetSearchQuery) -> List[AssetSearchResult]:
        """Search assets (limited support, mostly checking loaded markets)."""
        # CCXT doesn't have a global search API like CoinGecko.
        # We can search within the loaded markets of the default exchange.
        exchange = await self._get_exchange(self.default_exchange_id)
        
        results = []
        q = query.query.upper()
        
        for symbol in exchange.markets:
            if q in symbol:
                base, quote = symbol.split("/") if "/" in symbol else (symbol, "")
                internal_ticker = self.convert_to_internal_ticker(symbol)
                
                results.append(AssetSearchResult(
                    ticker=internal_ticker,
                    asset_type=AssetType.CRYPTO,
                    name=symbol,
                    exchange=self.default_exchange_id.upper(),
                    country="Global",
                    currency=quote,
                    relevance_score=1.0 if symbol == q else 0.5
                ))
                if len(results) >= query.limit:
                    break
                    
        return results

# src/server/mcp/tools/asset_tools.py
"""MCP tools for asset search and management.
Provides asset search, price queries, and asset information retrieval.
Returns structured data (JSON).
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import asyncio

from fastmcp import FastMCP, Context

from src.server.core.dependencies import Container
from src.server.domain.types import AssetSearchQuery, AssetType
from src.server.utils.logger import logger
from src.server.utils.decorators import auto_offload


# ============================================================
# 核心业务逻辑实现 (可被 MCP 和 FastAPI 共享)
# ============================================================

async def get_multiple_prices_impl(tickers: List[str]) -> Dict[str, Any]:
    """
    批量获取资产实时价格 (核心实现)
    
    Args:
        tickers: 资产代码列表 (格式: EXCHANGE:SYMBOL)
        
    Returns:
        Dict[ticker, price_data] - 价格数据字典
        
    Raises:
        Exception: 数据获取失败时抛出异常
    """
    manager = Container.adapter_manager()
    logger.info("Fetching multiple prices", count=len(tickers), tickers=tickers)
    
    prices = await manager.get_multiple_prices(tickers)
    result = {}
    for ticker, price in prices.items():
        if price:
            result[ticker] = price.to_dict()
        else:
            result[ticker] = None
    
    success_count = len([v for v in result.values() if v])
    logger.info("Successfully fetched prices", success_count=success_count, total=len(tickers))
    return result


# ============================================================
# MCP 工具注册 (保持原有接口不变)
# ============================================================

def register_asset_tools(mcp: FastMCP):
    """Register asset-related tools."""

    @mcp.tool(tags={"asset-search", "asset-extended"})
    async def search_assets(
        query: str, asset_types: list[str] = None, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for assets (stocks, ETFs, crypto, etc.).

        CRITICAL: 
        - Yahoo Finance (US/HK) DOES NOT support Chinese queries.
        - You MUST translate Chinese company names to English (e.g. "阿里巴巴" -> "Alibaba") before calling this tool.
        - Only use Chinese if you are explicitly searching for A-shares (Akshare).
        - If uncertain, search twice: once in English, once in Chinese.

        Args:
            query: Search keyword. SWAP Chinese to English for best results.
            asset_types: List of asset types (stock, etf, crypto, index)
            limit: Max results (default 10)

        Returns:
            List of asset search results with ticker in format EXCHANGE:SYMBOL
            
            **Ticker Format Examples:**
            - US stocks: NASDAQ:AAPL, NYSE:TSLA
            - HK stocks: HKEX:0700 (Tencent), HKEX:9988 (Alibaba)
              ⚠️ IMPORTANT: HK stocks use 4-digit format WITHOUT leading zero!
              ✅ Correct: HKEX:0700, HKEX:9988
              ❌ Wrong: HKEX:00700, HKEX:09988 (will fail)
            - A-shares: SSE:600519 (Shanghai), SZSE:000001 (Shenzhen)
            - Crypto: CRYPTO:BTC, CRYPTO:ETH
        """
        try:
            manager = Container.adapter_manager()
            logger.info("MCP tool called: search_assets", query=query, limit=limit)

            types = []
            if asset_types:
                for t in asset_types:
                    try:
                        types.append(AssetType(t.lower()))
                    except ValueError:
                        pass

            search_query = AssetSearchQuery(
                query=query, asset_types=types if types else None, limit=limit
            )

            results = await manager.search_assets(search_query)
            return [r.model_dump(mode="json") for r in results]

        except Exception as e:
            logger.error(f"Asset search failed: {e}")
            return [{"error": str(e)}]

    @mcp.tool(tags={"asset-info", "asset-extended"})
    async def get_asset_info(ticker: str) -> Dict[str, Any]:
        """Get detailed asset information.

        Args:
            ticker: Asset ticker in EXCHANGE:SYMBOL format (use search_assets to find tickers)

        Returns:
            Asset details (company profile, industry, sector, etc.)
        """
        try:
            manager = Container.adapter_manager()
            logger.info("MCP tool called: get_asset_info", ticker=ticker)

            asset = await manager.get_asset_info(ticker)
            if asset:
                return asset.model_dump(mode="json")
            return {
                "error": f"Asset not found: {ticker}. SYSTEM_ALERT: This asset is currently unavailable (404/Not Found) or network fluctuation. STOP RETRYING this ticker immediately. Report partial results or try again later."
            }

        except Exception as e:
            logger.error(f"Get asset info failed: {e}")
            return {
                "error": f"Get asset info failed: {str(e)}. SYSTEM_ALERT: External API error or network fluctuation. STOP RETRYING immediately."
            }

    @mcp.tool(tags={"asset-price", "asset-extended"})
    async def get_real_time_price(ticker: str) -> Dict[str, Any]:
        """Get real-time price for an asset.

        Args:
            ticker: Asset ticker in EXCHANGE:SYMBOL format (use search_assets to find tickers)

        Returns:
            Real-time price data (price, currency, change, volume, market_cap, etc.)
        """
        try:
            manager = Container.adapter_manager()
            logger.info("MCP tool called: get_real_time_price", ticker=ticker)

            price = await manager.get_real_time_price(ticker)
            if price:
                return price.to_dict()
            return {
                "error": f"Price not found for {ticker}. SYSTEM_ALERT: This asset is currently unavailable due to external API limit or network fluctuation. STOP RETRYING immediately. Report partial results or try again later."
            }

        except Exception as e:
            logger.error(f"Get real-time price failed: {e}")
            return {
                "error": f"Get real-time price failed: {str(e)}. SYSTEM_ALERT: External API error or network fluctuation. STOP RETRYING immediately."
            }

    @mcp.tool(tags={"asset-price-batch", "asset-extended"})
    async def get_multiple_prices(tickers: list[str]) -> Dict[str, Any]:
        """Get real-time prices for multiple assets.

        Args:
            tickers: List of asset tickers in EXCHANGE:SYMBOL format

        Returns:
            Dictionary mapping tickers to price data
        """
        try:
            return await get_multiple_prices_impl(tickers)
        except Exception as e:
            logger.error(f"MCP tool error in get_multiple_prices: {e}", exc_info=True)
            return {"error": str(e)}

    @mcp.tool(tags={"asset-history", "asset-extended"})
    async def get_historical_prices(
        ticker: str,
        start_date: str,
        end_date: str,
        filename: str,
        interval: str = "1d",
        ctx: Context = None
    ) -> Dict[str, Any]:
        """Get historical price data (OHLCV) and save to user's dataset library.

        **CRITICAL**: You MUST provide a descriptive filename for the output dataset.
        The filename should be descriptive and unique (e.g., "BABA_2023_Annual_Prices").
        
        Args:
            ticker: Asset ticker in EXCHANGE:SYMBOL format (use search_assets to find tickers)
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            filename: **REQUIRED** Custom filename for the saved dataset (NO .csv extension needed).
                      Example: "BABA_2023_Stock_Data", "Tesla_Q4_Prices"
            interval: Data interval (1d, 1wk, 1mo)

        Returns:
            Success message with dataset info. User can view data in "My Data" page.
        """
        import pandas as pd
        from src.server.core.dataset_manager import get_dataset_manager
        from src.server.utils.request_context import get_current_user_id
        
        try:
            # 验证 filename 参数
            if not filename or not filename.strip():
                return {
                    "error": "filename is required. Please provide a descriptive name like 'BABA_2023_Stock_Data'."
                }
            
            manager = Container.adapter_manager()
            logger.info(
                "MCP tool called: get_historical_prices",
                ticker=ticker,
                start=start_date,
                end=end_date,
                filename=filename,
            )

            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")

            prices = await manager.get_historical_prices(
                ticker=ticker,
                start_date=start,
                end_date=end,
                interval=interval,
            )
            
            if not prices:
                return {
                    "error": f"No data found for {ticker} in the specified date range."
                }
            
            # 转换为 DataFrame
            df = pd.DataFrame([p.to_dict() for p in prices])
            
            # 🔧 修复：使用 FastMCP 的 get_http_headers() 获取用户ID
            from fastmcp.server.dependencies import get_http_headers
            
            user_id = None
            
            # 从 HTTP 请求头中获取 X-User-Id
            headers = get_http_headers()
            if headers:
                # get_http_headers() 返回的键是小写的
                user_id = headers.get('x-user-id')
                logger.info(f"🔍 [DEBUG] 从 HTTP headers 获取 user_id: {user_id}")
                logger.info(f"🔍 [DEBUG] 所有 HTTP headers: {headers}")
            else:
                logger.warning("⚠️ get_http_headers() 返回 None")
            
            # Fallback: 从请求上下文变量中获取
            if not user_id:
                user_id = get_current_user_id()
                logger.info(f"🔍 [DEBUG] Fallback 从 get_current_user_id() 获取: {user_id}")
            
            if not user_id:
                # 如果没有用户ID，使用默认值（用于调试）
                user_id = "anonymous"
                logger.warning("⚠️ No user_id found from any source, using 'anonymous'")
            
            logger.info(f"🔍 [DEBUG] 最终使用的 user_id: {user_id}")
            
            # 使用 DatasetManager 保存
            dataset_mgr = get_dataset_manager()
            result = dataset_mgr.save_dataset(
                user_id=user_id,
                df=df,
                filename=filename.strip(),
                category="Stock"
            )
            
            if not result.get("success"):
                return {
                    "error": f"Failed to save dataset: {result.get('error', 'Unknown error')}"
                }
            
            # 返回用户友好的消息（不包含路径）
            return {
                "success": True,
                "message": f"✅ 数据已保存至 [{result['filename']}] ({result['rows']} 条记录, {result['cols']} 列)。请前往\"我的数据\"页面查看。",
                "summary": {
                    "filename": result['filename'],
                    "rows": result['rows'],
                    "cols": result['cols'],
                    "size": result.get('size_formatted', 'N/A'),
                    "stats": result.get('stats', {})
                }
            }

        except Exception as e:
            logger.error(f"Get historical prices failed: {e}", exc_info=True)
            return {
                "error": f"Get historical prices failed: {str(e)}. SYSTEM_ALERT: External API error or network fluctuation. STOP RETRYING immediately."
            }

    @mcp.tool(tags={"market-report", "asset-extended"})
    async def get_market_report(symbol: str) -> Dict[str, Any]:
        """Get a comprehensive market report for the given ticker.
        Includes current price and asset info.

        Args:
            symbol: Ticker in EXCHANGE:SYMBOL format (use search_assets to find tickers)

        Returns:
            Dictionary with asset info and current price
        """
        try:
            manager = Container.adapter_manager()
            logger.info("MCP tool called: get_market_report", symbol=symbol)

            # Fetch info and price in parallel
            info, price = await asyncio.gather(
                manager.get_asset_info(symbol), manager.get_real_time_price(symbol)
            )

            return {
                "symbol": symbol,
                "info": info.model_dump(mode="json") if info else None,
                "price": price.to_dict() if price else None,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"Failed to get market report: {e}")
            return {"error": str(e)}

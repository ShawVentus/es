
import asyncio
import yfinance as yf
from src.server.domain.adapters.yahoo_adapter import YahooAdapter

async def test_yahoo():
    print("Testing yfinance for HK stocks...")
    
    # Test 1: Direct yfinance - 4 digit
    ticker = "9988.HK"
    print(f"\n--- Direct yfinance: {ticker} ---")
    try:
        dat = yf.Ticker(ticker)
        print(f"Info keys: {list(dat.info.keys())[:5]}")
        print(f"Fast info price: {dat.fast_info.last_price}")
    except Exception as e:
        print(f"Direct yfinance failed: {e}")

    # Test 2: Direct yfinance - 5 digit
    ticker2 = "09988.HK"
    print(f"\n--- Direct yfinance: {ticker2} ---")
    try:
        dat = yf.Ticker(ticker2)
        print(f"Info keys: {list(dat.info.keys())[:5]}")
        print(f"Fast info price: {dat.fast_info.last_price}")
    except Exception as e:
        print(f"Direct yfinance failed: {e}")

    # Test 3: YahooAdapter (internally uses 9988.HK)
    print(f"\n--- YahooAdapter: HKEX:9988 ---")
    try:
        class MockCache:
            async def get(self, key): return None
            async def set(self, key, val, ttl=None): pass
            
        adapter = YahooAdapter(cache=MockCache())
        price = await adapter.get_real_time_price("HKEX:9988")
        print(f"Adapter Price: {price}")
        
    except Exception as e:
        print(f"Adapter failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_yahoo())

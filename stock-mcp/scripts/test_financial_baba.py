
import asyncio
import sys
import os
import json

# Add project root to path
sys.path.append("/root/stock-mcp")

from src.server.core.dependencies import Container
from src.server.utils.logger import logger
from dependency_injector.wiring import Provide, inject

async def main():
    # Initialize container
    container = Container()
    container.wire(modules=["__main__"])

    # Initialize AdapterManager and register adapters
    # Mimicking src/server/mcp/server.py logic
    adapter_manager = container.adapter_manager()
    
    # Connect Redis
    try:
        redis = container.redis()
        await redis.connect()
        print("Redis connected")
    except Exception as e:
        print(f"Redis connection warning: {e}")

    # Register adapters 
    print("Registering YahooAdapter...")
    try:
        yahoo = container.yahoo_adapter()
        adapter_manager.register_adapter(yahoo)
    except Exception as e:
        print(f"Failed to register Yahoo: {e}")

    # Finnhub
    config = container.config()
    if config.finnhub.is_available:
        print("Finnhub enabled, connecting and registering...")
        try:
            finnhub_conn = container.finnhub()
            await finnhub_conn.connect()
            finnhub_adapter = container.finnhub_adapter()
            adapter_manager.register_adapter(finnhub_adapter)
        except Exception as e:
            print(f"Failed to register Finnhub: {e}")
    else:
        print("Finnhub disabled in config.")

    # Get service
    service = container.fundamental_service()
    
    symbol = "NYSE:BABA" 
    ticker = symbol
    
    print(f"Testing get_financial_report with symbol: {ticker}")

    try:
        print("Calling service.get_fundamental_analysis...")
        result = await service.get_fundamental_analysis(ticker)
        
        # Save to file
        output_path = "/root/stock-mcp/scripts/baba_financials.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print(f"\n--- Result saved to {output_path} ---")
        
    except Exception as e:
        print(f"Error executing analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

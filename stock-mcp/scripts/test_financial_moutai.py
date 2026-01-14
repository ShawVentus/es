
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

    # Initialize AdapterManager
    adapter_manager = container.adapter_manager()
    
    # Connect Redis
    try:
        redis = container.redis()
        await redis.connect()
        print("Redis connected")
    except Exception as e:
        print(f"Redis connection warning: {e}")

    # Register AkshareAdapter (Primary target for this test since Tushare is disabled)
    print("Registering AkshareAdapter...")
    try:
        akshare = container.akshare_adapter()
        adapter_manager.register_adapter(akshare)
    except Exception as e:
        print(f"Failed to register Akshare: {e}")

    # Register others just in case
    try:
        container.baostock_adapter() # Init to be sure
        adapter_manager.register_adapter(container.baostock_adapter())
    except:
        pass

    # Get service
    service = container.fundamental_service()
    
    # Moutai ticker
    symbol = "600519" 
    ticker = f"SSE:{symbol}"
    
    print(f"Testing get_financial_report with symbol: {ticker}")

    try:
        # Mock request to service
        # The service internally calls adapter_manager.get_financials(ticker)
        print("Calling service.get_fundamental_analysis...")
        result = await service.get_fundamental_analysis(ticker)
        
        # Save to file
        output_path = "/root/stock-mcp/scripts/moutai_financials.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print(f"\n--- Result saved to {output_path} ---")
        
        # Print summary of what we got
        if "error" in result:
            print(f"Error in result: {result['error']}")
        else:
            print(f"Company: {result.get('company_info', {}).get('公司名称')}")
            print(f"Health Score: {result.get('health_score')}")
            print(f"Analysis: {result.get('analysis')}")
            
            # Check if we got financial data
            bs = result.get('ratios', {}).get('valuation', {})
            print(f"Valuation Ratios: {bs}")
        
    except Exception as e:
        print(f"Error executing analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

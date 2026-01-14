
import asyncio
from src.server.domain.adapters.yahoo_adapter import YahooAdapter
from src.server.mcp.tools import asset_tools
from src.server.core.dependencies import Container
from unittest.mock import MagicMock

# Mock Container and AdapterManager to force an error
async def verify_error_message():
    print("Verifying enhanced error message...")
    
    # Mock container dependencies
    mock_adapter = MagicMock()
    # Force get_real_time_price to return None (simulating not found)
    async def mock_get_price(ticker): return None
    mock_adapter.get_real_time_price = mock_get_price
    
    mock_manager = MagicMock()
    mock_manager.get_real_time_price = mock_get_price
    
    # We need to patch Container.adapter_manager() to return our mock
    # Since Container uses dependency-injector, we can override providers
    Container.adapter_manager.override(mock_manager)
    
    # Call the tool directly
    try:
        result = await asset_tools.get_real_time_price(ticker="HKEX:9988")
        print(f"Result: {result}")
        
        expected_msg = "SYSTEM_ALERT"
        if "error" in result and expected_msg in result["error"]:
            print("✅ SUCCESS: Error message contains SYSTEM_ALERT instruction.")
        else:
            print(f"❌ FAILURE: Error message does not contain instruction. Got: {result}")
            
    except Exception as e:
        print(f"Test failed with exception: {e}")
    finally:
        Container.adapter_manager.reset_override()

if __name__ == "__main__":
    asyncio.run(verify_error_message())

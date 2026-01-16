# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock Tool MCP Server is a comprehensive Model Context Protocol (MCP) server for financial market data, technical analysis, and fundamental research. It provides AI agents with professional-grade stock market capabilities through a unified interface to multiple data sources.

## Commands

### Development & Testing

```bash
# Start MCP server in HTTP mode (port 9898)
export MCP_TRANSPORT=streamable-http
python -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898

# Start with hot reload for development
MCP_TRANSPORT=streamable-http python -m uvicorn src.server.app:app --reload --port 9898

# Start in stdio mode (for AI agent integration)
bash start_stock_mcp_stdio.sh
# Or manually:
conda activate stock-mcp
python -c "import src.server.mcp.server as m; m.create_mcp_server().run(transport='stdio')"

# Run tests
python -m pytest tests/ -v -s
python -m pytest tests/test_phase1_structure_only.py -v  # Phase 1 structure tests

# Run specific test scripts
python scripts/test_mcp_http.py  # Test HTTP interface
python scripts/mcp2openapi.py    # Generate OpenAPI spec
```

### Environment Setup

```bash
# Create conda environment
conda create -n stock-mcp python=3.11.14
conda activate stock-mcp

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env to add API keys (optional):
# - TUSHARE_TOKEN for A-share data
# - FINNHUB_API_KEY for US institutional data
# - DASHSCOPE_API_KEY for Alibaba Cloud AI
```

## Architecture

### Domain-Driven Design (DDD) Structure

```
src/server/
├── app.py                 # FastMCP application entry point
├── config/                # Configuration management
│   └── settings.py       # Pydantic settings with env validation
├── core/                  # Core business logic
│   └── dependencies.py   # Dependency injection container (dependency-injector)
├── domain/                # Domain layer
│   ├── adapters/         # Data source adapters (Yahoo, Akshare, Tushare, etc.)
│   ├── adapter_manager.py # Smart routing & failover manager
│   ├── models/           # Domain models
│   ├── services/         # Domain services (fundamental, news, technical, filings)
│   └── types.py          # Shared type definitions
├── infrastructure/       # Infrastructure layer
│   ├── cache/            # Redis caching layer
│   ├── connections/      # External API connections (Redis, Tushare, Finnhub, Baostock)
│   └── minio_client.py   # MinIO client for document storage
├── mcp/                  # MCP protocol layer
│   ├── server.py         # MCP server creation and tool registration
│   └── tools/            # MCP tool definitions (39 AKShare tools + core tools)
└── utils/                # Utilities (logger, file_manager, request_context)
```

### Key Architectural Patterns

#### 1. **Adapter Pattern with Smart Routing**

The `AdapterManager` (`domain/adapter_manager.py`) provides automatic failover across multiple data sources:

- **US Stocks**: Yahoo Finance → Finnhub (if enabled)
- **A-Shares**: Tushare (if enabled) → Akshare → Baostock
- **Crypto**: CryptoAdapter → CCXTAdapter

When one adapter fails, the manager automatically tries the next available source without client code changes.

#### 2. **Dependency Injection**

All services, adapters, and connections are registered in `core/dependencies.py` using `dependency-injector`. Access instances via:

```python
from src.server.core.dependencies import Container

# Get service instances
fundamental_service = Container.fundamental_service()
adapter_manager = Container.adapter_manager()
redis_cache = Container.cache()
```

#### 3. **Request Context Management**

User ID tracking across async requests using `contextvars` in `utils/request_context.py`:

```python
from src.server.utils.request_context import get_current_user_id, set_current_user_id

# In middleware/tool: set user ID
set_current_user_id(user_id)

# In any downstream code: retrieve user ID
user_id = get_current_user_id() or "anonymous"
```

This enables user-isolated data storage: `/root/librechat_user_data/{user_id}/dataset/`

#### 4. **MCP Tool Registration**

Tools are organized by domain and registered in `mcp/server.py`:

```python
def create_mcp_server() -> FastMCP:
    mcp = FastMCP(name="stock-tool-mcp", version="1.0.0", lifespan=mcp_lifespan)

    # Register tool groups
    register_fundamental_tools(mcp)
    register_news_tools(mcp)
    register_technical_tools(mcp)
    # ... + 39 AKShare tools

    return mcp
```

Each tool module exports a `register_*_tools(mcp)` function that defines tools using `@mcp.tool()` decorator.

### Data Flow

1. **Client Request** → MCP Server (HTTP or stdio)
2. **Tool Call** → Domain Service (e.g., `FundamentalService`)
3. **Service** → `AdapterManager` for data retrieval
4. **AdapterManager** → Selects appropriate adapter based on asset type
5. **Adapter** → External API (with caching via `AsyncRedisCache`)
6. **Response** → Structured data returned to client

## AKShare Integration (Phase 1)

### 39 Data Acquisition Tools

Six modules provide access to financial data via AKShare:

1. **`akshare_macro_tools.py`** - 24 macroeconomic indicators
   - China: GDP, CPI, PPI, PMI, reserves, money supply, etc.
   - US: GDP, CPI, PPI, industrial production, unemployment
   - Global: OPEC reports

2. **`akshare_rate_tools.py`** - 4 interest rate tools
   - Fed rate decisions, PBoC rate decisions, interbank rates, repo rates

3. **`akshare_forex_tools.py`** - 4 forex tools
   - Forex history, RMB exchange rates, FX swap quotes

4. **`akshare_derivatives_tools.py`** - 3 futures/options tools
   - Futures contracts, financial options, commodity options

5. **`akshare_bond_spot_tools.py`** - 3 bond/spot tools
   - Bond market deals, yield curves, Shanghai Gold Exchange

6. **`akshare_index_other_tools.py`** - 8 index & other tools
   - A-share indices, US indices, QDII, air quality data

### Key Features

- **Exponential Backoff Retry**: `_call_akshare_with_retry()` handles network failures
- **User Isolation**: Data saved to `/root/librechat_user_data/{user_id}/dataset/`
- **Chinese Filenames**: e.g., `LPR品种数据.csv`, `中国GDP年率.csv`
- **Unified Response**: `{success, data, source, saved_path, chinese_name, record_count}`
- **Error Handling**: All tools wrapped in try-except with fallback responses

## Testing Strategy

### Structure Tests (No Runtime Dependencies)

`tests/test_phase1_structure_only.py` validates:
- File existence and line counts
- Required imports (fastmcp, akshare, pandas)
- Retry logic presence
- Mapping tables (CHINESE_NAME_MAP, DATA_SOURCE_MAP)
- MCP server registration

Run: `pytest tests/test_phase1_structure_only.py -v`

### Integration Tests (Require Services)

Tests requiring Redis, external APIs, or full server startup should:
1. Check if services are available
2. Skip gracefully if not (use `@pytest.mark.skipif`)
3. Document required setup in docstrings

## Stock Ticker Format

Critical for correct data retrieval:

- **A-shares**: `SSE:600519` (Shanghai), `SZSE:000001` (Shenzhen)
- **US stocks**: `NASDAQ:AAPL`, `NYSE:TSLA`
- **Crypto**: `CRYPTO:BTC`, `CRYPTO:ETH`
- **Forex/Indices**: Use Yahoo Finance symbols

## Configuration

### Environment Variables (.env)

```bash
# Optional API keys (enables additional data sources)
TUSHARE_ENABLED=False      # Enable Tushare (requires token)
TUSHARE_TOKEN=your_token
FINNHUB_ENABLED=False      # Enable Finnhub
FINNHUB_API_KEY=your_key
DASHSCOPE_API_KEY=your_key # For Qwen AI integration

# Proxy settings (if needed)
PROXY_ENABLED=False
PROXY_HOST=127.0.0.1
PROXY_PORT=7890

# Redis (optional, defaults to localhost:6379)
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Pluggable Design

If API keys are not configured, the system automatically:
1. Disables the corresponding data source
2. Falls back to free alternatives (Akshare, Baostock, Yahoo Finance)
3. Logs warnings but continues operation

## Future Development Notes (Roadmap)

From README.md:

- **Real Trading Execution**: `execute_order` currently in simulation mode
- **Advanced Caching**: Fine-grained TTL for different data types
- **User Account Management**: Secure API key storage per user
- **More Data Adapters**: Sentiment analysis, alternative data
- **WebSocket Push**: Real-time market data streams
- **Backtesting Engine**: Strategy validation

## Common Pitfalls

1. **Import Errors**: Ensure `conda activate stock-mcp` before running
2. **Port Conflicts**: Default port 9898 may be in use
3. **Redis Connection**: Cache gracefully degrades if Redis unavailable
4. **User Context**: Some tools require `set_current_user_id()` in request context
5. **Ticker Format**: Always use exchange prefix (e.g., `SSE:`, `NASDAQ:`)

## Related Documentation

- `/root/docs/ralph-loop/` - EasySTAT project development phases
- `/root/docs/接口.md` - AKShare interface catalog
- `/root/docs/qwen_api.md` - Qwen API usage examples
- `README.md` - Complete project documentation

# src/server/app.py
"""
Main application entry point.

This module creates a hybrid application that supports both:
- RESTful API (FastAPI) for standard HTTP JSON API calls
- MCP Protocol (Streamable HTTP) for AI Agent integration

Architecture:
- /api/v1/*  -> RESTful API endpoints
- /mcp       -> MCP protocol endpoint (JSON-RPC 2.0)
- /health    -> Health check endpoint
- /docs      -> OpenAPI documentation (Swagger UI)
- /redoc     -> ReDoc documentation
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from src.server.mcp.server import create_mcp_server
from src.server.core.health import router as health_router
from src.server.api.routes import market_data_router, filings_router
from src.server.core.dependencies import Container
from src.server.utils.logger import logger
from src.server.utils.request_context import set_current_user_id, clear_current_user_id
from src.server.utils.user_id_resolver import get_user_id_resolver


class UserIdMiddleware(BaseHTTPMiddleware):
    """
    X-User-Id 请求头提取中间件
    
    说明：
    - 从HTTP请求头中提取 X-User-Id
    - 存储到请求上下文变量中
    - 使MCP工具可以访问当前用户ID进行文件存储隔离
    """
    async def dispatch(self, request: Request, call_next):
        # 1. 从请求头提取X-User-Id (可能是ObjectId或邮箱)
        user_id_from_header = request.headers.get('X-User-Id')
        
        # 2. 从Authorization header提取JWT token
        auth_header = request.headers.get('Authorization')
        
        # 🔍 调试：输出所有请求头
        logger.info(f"[UserIdMiddleware] 🔍 [DEBUG] 请求路径: {request.url.path}")
        logger.info(f"[UserIdMiddleware] 🔍 [DEBUG] X-User-Id: {user_id_from_header}")
        logger.info(f"[UserIdMiddleware] 🔍 [DEBUG] Authorization: {'Bearer ...' if auth_header else 'None'}")
        
        # 3. 尝试从JWT提取邮箱并注册映射
        resolved_email = None
        if auth_header and user_id_from_header:
            # 提取Bearer token
            if auth_header.startswith('Bearer '):
                jwt_token = auth_header[7:]  # 移除 "Bearer " 前缀
                
                # 使用resolver解析JWT
                resolver = get_user_id_resolver()
                resolved_email = resolver.register_from_jwt(user_id_from_header, jwt_token)
        
        # 4. 确定最终使用的用户ID（优先使用邮箱）
        final_user_id = resolved_email or user_id_from_header
        
        if final_user_id:
            set_current_user_id(final_user_id)
            if resolved_email:
                logger.info(f"[UserIdMiddleware] ✅ 使用邮箱作为用户ID: {final_user_id}")
            else:
                logger.info(f"[UserIdMiddleware] ✅ 使用原始用户ID: {final_user_id}")
        else:
            logger.warning(f"[UserIdMiddleware] ⚠️ 未找到X-User-Id请求头！")
        
        # contextvars会自动管理生命周期，无需手动清除
        # 这确保异步执行的MCP工具能够正确获取用户ID
        response = await call_next(request)
        return response


def create_app():
    """Create the hybrid application: FastAPI + MCP Protocol

    Returns:
        FastAPI: Application instance with both RESTful API and MCP support
    """

    # 1. Create MCP server instance early so we can integrate its lifespan
    mcp_server = None
    mcp_app = None
    try:
        mcp_server = create_mcp_server()
        mcp_app = mcp_server.streamable_http_app(path="/")
    except Exception as e:
        logger.error(f"Failed to create MCP server: {e}", exc_info=True)
        logger.warning("⚠️  MCP server creation failed, MCP features will be disabled")

    # 2. Define application lifespan - manages connections and adapters
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Application lifespan - manages connections and adapters."""
        # Startup
        logger.info("🚀 Starting application")

        # Initialize Redis
        redis = Container.redis()
        await redis.connect()
        logger.info("✅ Redis connection established")

        # Get config
        config = Container.config()
        
        # Initialize Tushare connection (only if enabled)
        tushare_available = False
        if config.tushare.is_available:
            tushare = Container.tushare()
            tushare_available = await tushare.connect()
            if tushare_available:
                logger.info("✅ Tushare connection established")
            else:
                logger.warning("⚠️ Tushare connection failed - will use fallback adapters")
        else:
            logger.info("ℹ️  Tushare disabled (set TUSHARE_ENABLED=True and provide token to enable)")

        # Initialize FinnHub connection (only if enabled)
        finnhub_available = False
        if config.finnhub.is_available:
            finnhub = Container.finnhub()
            await finnhub.connect()
            finnhub_available = True
            logger.info("✅ FinnHub connection established")
        else:
            logger.info("ℹ️  FinnHub disabled (set FINNHUB_ENABLED=True and provide API key to enable)")

        # Initialize Baostock connection
        baostock = Container.baostock()
        await baostock.connect()
        logger.info("✅ Baostock connection established")

        # Register adapters
        logger.info("📦 Registering data adapters...")
        adapter_manager = Container.adapter_manager()

        # A股数据源 - 按优先级注册
        if tushare_available:
            adapter_manager.register_adapter(Container.tushare_adapter())
        adapter_manager.register_adapter(Container.akshare_adapter())
        adapter_manager.register_adapter(Container.baostock_adapter())

        # 加密货币数据源
        adapter_manager.register_adapter(Container.crypto_adapter())
        adapter_manager.register_adapter(Container.ccxt_adapter())

        # 美股数据源
        adapter_manager.register_adapter(Container.yahoo_adapter())
        if finnhub_available:
            adapter_manager.register_adapter(Container.finnhub_adapter())

        logger.info(
            f"✅ All adapters registered (A-share: {'Tushare > ' if tushare_available else ''}Akshare > Baostock)"
        )

        # Integrate MCP lifespan if available
        if mcp_app:
            logger.info("🔄 Initializing MCP server lifespan...")
            async with mcp_app.router.lifespan_context(mcp_app):
                yield
        else:
            yield

        # Shutdown
        logger.info("🛑 Shutting down application")

    # 3. Create FastAPI application
    app = FastAPI(
        title="Stock Tool Server",
        description="""
        ## 🚀 金融数据服务器
        
        提供两种协议支持,满足不同场景的集成需求:
        
        ### 📡 协议支持
        
        #### 1. RESTful API (推荐用于 Java/Spring 集成)
        - **Base URL**: `/api/v1`
        - **文档**: [Swagger UI](/docs) | [ReDoc](/redoc)
        - **特点**: 标准 HTTP JSON API,易于集成
        
        #### 2. MCP Protocol (用于 AI Agent 集成)
        - **Endpoint**: `/mcp`
        - **协议**: Streamable HTTP (JSON-RPC 2.0)
        - **用途**: Claude Desktop, Cursor 等 AI Agent
        
        ### 🎯 核心功能
        
        - 📊 **批量价格查询**: 一次请求获取多个资产的实时价格
        - 📈 **技术指标计算**: SMA, RSI, MACD, 布林带等 20+ 指标
        - 🔍 **资产搜索**: 支持股票、加密货币、ETF 搜索
        - 📰 **新闻与研究**: 获取市场新闻和深度研究报告
        
        ### 🌍 支持的市场
        
        - **美股**: NASDAQ, NYSE (通过 Yahoo Finance, Finnhub)
        - **A股**: 上交所, 深交所 (通过 Akshare, Tushare, Baostock)
        - **加密货币**: Binance, OKX 等 (通过 CCXT)
        
        ### 📖 快速开始
        
        **RESTful API 示例:**
        ```bash
        # 批量获取价格
        curl -X POST "http://localhost:9898/api/v1/market/prices/batch" \\
          -H "Content-Type: application/json" \\
          -d '{"tickers": ["BINANCE:BTCUSDT", "NASDAQ:AAPL"]}'
        
        # 计算技术指标
        curl -X POST "http://localhost:9898/api/v1/market/indicators/calculate" \\
          -H "Content-Type: application/json" \\
          -d '{"symbol": "BINANCE:BTCUSDT", "period": "30d", "interval": "1d"}'
        ```
        
        **MCP Protocol 示例:**
        ```bash
        curl -X POST "http://localhost:9898/mcp" \\
          -H "Content-Type: application/json" \\
          -d '{
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
              "name": "get_multiple_prices",
              "arguments": {"tickers": ["BINANCE:BTCUSDT"]}
            },
            "id": "1"
          }'
        ```
        """,
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,  # Use the inner lifespan function
        openapi_tags=[
            {
                "name": "Market Data",
                "description": "市场数据 API - 价格查询和技术指标计算",
            },
            {"name": "Health", "description": "健康检查 - 服务状态监控"},
            {"name": "Root", "description": "根路径 - 服务信息"},
            {"name": "Preprocessing", "description": "数据预处理 - 清洗、转换和统计"},
            {"name": "Statistics", "description": "统计检验 - 单变量和多变量检验"},
            {"name": "Models", "description": "时序模型 - ARIMA/GARCH/VAR/VECM建模"},
            {"name": "Reports", "description": "报告生成 - Word学术报告生成与下载"},
        ],
    )

    # 4. Add CORS middleware (允许跨域请求)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 生产环境应限制具体域名
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    logger.info("✅ CORS middleware configured")

    # 4.1 Add UserIdMiddleware (提取X-User-Id请求头用于文件存储隔离)
    app.add_middleware(UserIdMiddleware)
    logger.info("✅ UserIdMiddleware configured (X-User-Id extraction)")


    # 5. Register RESTful API routes
    app.include_router(health_router, tags=["Health"])
    app.include_router(market_data_router, tags=["Market Data"])
    app.include_router(filings_router, prefix="/api/v1", tags=["Filings"])
    
    # 5.1 Register Files API router (数据集管理)
    from src.server.api.routes.files import router as files_router
    app.include_router(files_router, tags=["Files"])

    # 5.2 Register Preprocessing API router (数据预处理)
    from src.server.api.routes.preprocessing import router as preprocessing_router
    app.include_router(preprocessing_router, tags=["Preprocessing"])

    # 5.3 Register Statistics API router (统计检验)
    from src.server.api.routes.statistics import router as statistics_router
    app.include_router(statistics_router, tags=["Statistics"])

    # 5.4 Register Models API router (时序模型)
    from src.server.api.routes.models import router as models_router
    app.include_router(models_router, tags=["Models"])

    # 5.5 Register Reports API router (报告生成)
    from src.server.api.routes.reports import router as reports_router
    app.include_router(reports_router, tags=["Reports"])

    logger.info("✅ RESTful API routes registered")
    logger.info("   - Health check: /health")
    logger.info("   - Market data: /api/v1/market/*")
    logger.info("   - Filings: /api/v1/filings/*")
    logger.info("   - Files: /api/v1/files/*")
    logger.info("   - Preprocessing: /api/preprocessing/*")
    logger.info("   - Statistics: /api/statistics/*")
    logger.info("   - Models: /api/models/*")
    logger.info("   - Reports: /api/reports/*")

    # 6. Mount MCP protocol endpoint
    if mcp_app:
        try:
            app.mount("/mcp", mcp_app)
            logger.info("✅ MCP protocol endpoint mounted at /mcp")
        except Exception as e:
            logger.error(f"Failed to mount MCP endpoint: {e}", exc_info=True)
            logger.warning("⚠️  MCP endpoint not available, only RESTful API will work")

    # 7. Add root endpoint with service information
    @app.get("/", tags=["Root"])
    async def root():
        """Get service information and available endpoints"""
        return {
            "service": "Stock Tool Server",
            "version": "1.0.0",
            "description": "Financial data service with dual protocol support",
            "protocols": {
                "restful_api": {
                    "description": "Standard HTTP JSON API",
                    "base_url": "/api/v1",
                    "documentation": {
                        "swagger_ui": "/docs",
                        "redoc": "/redoc",
                        "openapi_json": "/openapi.json",
                    },
                    "endpoints": {
                        "batch_prices": "POST /api/v1/market/prices/batch",
                        "technical_indicators": "POST /api/v1/market/indicators/calculate",
                    },
                },
                "mcp": {
                    "description": "Model Context Protocol (for AI Agents)",
                    "endpoint": "/mcp",
                    "protocol": "Streamable HTTP (JSON-RPC 2.0)",
                    "tools_count": 20,
                },
            },
            "health_check": "/health",
            "supported_markets": ["US Stocks", "China A-Shares", "Cryptocurrency"],
            "supported_exchanges": ["NASDAQ", "NYSE", "SSE", "SZSE", "BINANCE", "OKX"],
        }

    logger.info("=" * 70)
    logger.info("🚀 Stock Tool Server Initialized")
    logger.info("=" * 70)
    logger.info("📡 Protocols:")
    logger.info("   - RESTful API: http://localhost:9898/api/v1")
    logger.info("   - MCP Protocol: http://localhost:9898/mcp")
    logger.info("📖 Documentation:")
    logger.info("   - Swagger UI: http://localhost:9898/docs")
    logger.info("   - ReDoc: http://localhost:9898/redoc")
    logger.info("💚 Health Check: http://localhost:9898/health")
    logger.info("=" * 70)

    return app


# Create the app instance
app = create_app()

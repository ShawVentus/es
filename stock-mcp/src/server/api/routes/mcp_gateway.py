"""
MCP Gateway API Routes - MCP工具调用网关接口

提供两个核心接口：
1. GET /api/v1/tools - 获取所有MCP工具的OpenAI格式定义
2. POST /api/v1/mcp/call - 通用MCP工具调用网关

架构设计：
- 路由层只负责HTTP请求/响应处理
- 业务逻辑委托给MCPGatewayService服务层
- 统一的错误处理和日志记录
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from src.server.domain.services.mcp_gateway_service import MCPGatewayService
from src.server.core.dependencies import Container
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/v1", tags=["MCP Gateway"])


class MCPCallRequest(BaseModel):
    """MCP工具调用请求模型"""
    tool_name: str = Field(..., description="工具名称")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="工具参数")


class MCPCallResponse(BaseModel):
    """MCP工具调用响应模型"""
    success: bool = Field(..., description="是否成功")
    result: Optional[Any] = Field(None, description="工具执行结果")
    error: Optional[str] = Field(None, description="错误信息")


class ToolsResponse(BaseModel):
    """工具列表响应模型"""
    success: bool = Field(..., description="是否成功")
    tools: List[Dict[str, Any]] = Field(..., description="OpenAI格式的工具列表")
    count: int = Field(..., description="工具数量")


# ===== 工具发现接口 =====

@router.get(
    "/tools",
    response_model=ToolsResponse,
    summary="获取所有MCP工具列表",
    description="返回所有注册的MCP工具的OpenAI格式定义，供前端获取并传递给LLM"
)
async def list_tools(request: Request):
    """
    获取所有MCP工具的OpenAI格式定义

    Returns:
        ToolsResponse: 包含工具列表和数量的响应

    Example Response:
    {
        "success": true,
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "calculate_technical_indicators",
                    "description": "Calculate technical indicators",
                    "parameters": {...}
                }
            }
        ],
        "count": 60
    }
    """
    try:
        logger.info("[MCP Gateway API] Received request to list tools")

        # 获取全局MCP服务器实例
        from src.server.app import get_global_mcp_server
        mcp_server = get_global_mcp_server()

        if not mcp_server:
            raise HTTPException(status_code=503, detail="MCP server not initialized")

        # 创建服务实例
        service = MCPGatewayService(mcp_server)

        # 获取工具列表（异步调用）
        tools = await service.get_openai_tools()

        logger.info(f"[MCP Gateway API] Successfully returned {len(tools)} tools")

        return ToolsResponse(
            success=True,
            tools=tools,
            count=len(tools)
        )

    except Exception as e:
        logger.error(f"[MCP Gateway API] Error listing tools: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list tools: {str(e)}"
        )


# ===== 工具调用网关 =====

@router.post(
    "/mcp/call",
    response_model=MCPCallResponse,
    summary="调用MCP工具",
    description="通用MCP工具调用网关，支持调用所有注册的MCP工具"
)
async def call_mcp_tool(request_body: MCPCallRequest, request: Request):
    """
    调用指定的MCP工具

    Args:
        request_body: 包含工具名和参数的请求体
        request: FastAPI请求对象（用于提取user_id等上下文）

    Returns:
        MCPCallResponse: 工具执行结果或错误信息

    Example Request:
    {
        "tool_name": "calculate_technical_indicators",
        "arguments": {
            "symbol": "SSE:600519",
            "indicators": ["sma_20", "rsi_14"]
        }
    }

    Example Response:
    {
        "success": true,
        "result": {
            "symbol": "SSE:600519",
            "indicators": {...}
        },
        "error": null
    }
    """
    try:
        logger.info(f"[MCP Gateway API] Calling tool: {request_body.tool_name}")
        logger.debug(f"[MCP Gateway API] Tool arguments: {request_body.arguments}")

        # 确保user_id在当前上下文中（修复contextvars丢失问题）
        from src.server.utils.request_context import get_current_user_id
        user_id = get_current_user_id()
        logger.info(f"[MCP Gateway API] 🔍 Current user_id in context: {user_id}")

        if not user_id:
            logger.error("[MCP Gateway API] ❌ No user_id in context! Cookie auth may have failed.")
            # 尝试从request直接读取
            user_id_from_cookie = request.cookies.get('clientName')
            logger.error(f"[MCP Gateway API] 🔍 Cookie clientName: {user_id_from_cookie}")

        # 获取全局MCP服务器实例
        from src.server.app import get_global_mcp_server
        mcp_server = get_global_mcp_server()

        if not mcp_server:
            raise HTTPException(status_code=503, detail="MCP server not initialized")

        # 创建服务实例
        service = MCPGatewayService(mcp_server)

        # 调用工具（120秒超时，传递user_id）
        result = await service.call_tool(
            tool_name=request_body.tool_name,
            arguments=request_body.arguments,
            timeout=120,
            user_id=user_id  # 传递用户ID到工具上下文
        )

        logger.info(f"[MCP Gateway API] Tool '{request_body.tool_name}' executed successfully")

        return MCPCallResponse(
            success=True,
            result=result,
            error=None
        )

    except ValueError as e:
        # 工具不存在（只有"not found in registry"才返回404）
        if "not found in registry" in str(e):
            logger.warning(f"[MCP Gateway API] Tool not found: {request_body.tool_name}")
            raise HTTPException(
                status_code=404,
                detail=f"Tool '{request_body.tool_name}' not found"
            )
        else:
            # 其他ValueError（工具内部错误），返回给LLM
            logger.error(f"[MCP Gateway API] Tool execution error: {e}")
            return MCPCallResponse(
                success=False,
                result=None,
                error=str(e)
            )

    except TimeoutError as e:
        # 执行超时
        logger.error(f"[MCP Gateway API] Tool execution timeout: {request_body.tool_name}")
        raise HTTPException(
            status_code=504,
            detail=str(e)
        )

    except RuntimeError as e:
        # 工具执行错误（返回给LLM而不是抛出HTTP异常）
        logger.error(f"[MCP Gateway API] Tool runtime error: {e}")
        return MCPCallResponse(
            success=False,
            result=None,
            error=str(e)
        )

    except Exception as e:
        # 其他未预期错误
        logger.error(
            f"[MCP Gateway API] Unexpected error calling tool '{request_body.tool_name}': {e}",
            exc_info=True
        )

        # 返回错误响应（让LLM能看到错误信息）
        return MCPCallResponse(
            success=False,
            result=None,
            error=str(e)
        )

"""
Authentication API Routes - 认证接口

提供前端认证相关的接口：
1. GET /api/v1/auth/current-user - 获取当前用户信息（基于cookie）

架构设计（修改后）：
- 自己处理cookie认证（不依赖中间件）
- 一次性认证并缓存结果（避免重复调用外网API）
- 返回统一的用户信息格式（兼容LibreChat）
- 中间件从缓存读取（避免容器内网络隔离问题）
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional
from src.server.utils.request_context import get_current_user_id, set_current_user_id
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# 延迟导入，复用app.py中的全局实例（避免双重实例导致缓存不共享）
def get_auth_service():
    """获取全局认证服务实例（与中间件共享缓存）"""
    from src.server.app import get_global_bohrium_auth
    return get_global_bohrium_auth()


class CurrentUserResponse(BaseModel):
    """当前用户响应模型"""
    success: bool = Field(..., description="是否成功")
    user: Optional[dict] = Field(None, description="用户信息")
    error: Optional[str] = Field(None, description="错误信息")


@router.get(
    "/current-user",
    response_model=CurrentUserResponse,
    summary="获取当前用户信息",
    description="基于cookie中的appAccessKey和clientName获取当前用户信息（一次性认证并缓存）"
)
async def get_current_user(request: Request):
    """
    获取当前用户信息（修改后架构）

    认证方式（仿照之前成功的项目）：
    1. 自己从cookie提取appAccessKey和clientName
    2. 调用BohriumAuthService获取userid（首次）
    3. 缓存结果（避免后续请求重复调用外网API）
    4. 返回完整UserProfile（供前端存储）

    优点：
    - 只调用一次外网API（首次访问）
    - 后续请求从缓存读取（不受容器网络限制）
    - 前端存储后用X-User-Id请求头（最佳性能）

    Returns:
        CurrentUserResponse: 用户信息或错误

    Response Example:
    {
        "success": true,
        "user": {
            "id": "1493480",
            "name": "test_client",
            "email": null
        },
        "error": null
    }
    """
    try:
        logger.info("[Auth API] Received request to get current user")

        # 1. 优先从上下文获取（如果中间件已设置）
        user_id = get_current_user_id()

        # 2. 如果中间件未设置，自己处理cookie认证
        if not user_id:
            logger.info("[Auth API] No user in context, attempting cookie authentication")

            # 提取cookie（不设默认值，准确判断是否存在）
            app_access_key = request.cookies.get('appAccessKey')
            client_name = request.cookies.get('clientName')

            if not app_access_key or not client_name:
                logger.warning("[Auth API] Missing cookies: appAccessKey or clientName")
                return CurrentUserResponse(
                    success=False,
                    user=None,
                    error="Not authenticated - missing cookies (appAccessKey or clientName)"
                )

            # 获取全局认证服务实例（与中间件共享缓存）
            auth_service = get_auth_service()
            user_id = await auth_service.authenticate(app_access_key, client_name)

            if not user_id:
                logger.warning("[Auth API] Authentication failed - Bohrium API returned no userid")
                return CurrentUserResponse(
                    success=False,
                    user=None,
                    error="Authentication failed - unable to verify credentials with Bohrium API"
                )

            # 设置到上下文（供后续使用）
            set_current_user_id(user_id)
            logger.info(f"[Auth API] ✅ Authentication successful, userid: {user_id}")
        else:
            # 从cookie读取clientName（用于返回）
            client_name = request.cookies.get('clientName', 'Unknown User')

        # 3. 返回兼容LibreChat格式的用户信息
        logger.info(f"[Auth API] Returning user info: {user_id}")

        return CurrentUserResponse(
            success=True,
            user={
                "id": user_id,  # 玻尔userid
                "name": client_name,  # 客户端名称
                "email": None,  # 可选字段（玻尔API未提供）
                "role": "user"  # 可选字段
            },
            error=None
        )

    except Exception as e:
        logger.error(f"[Auth API] Error getting current user: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get current user: {str(e)}"
        )

# src/server/utils/request_context.py
"""
请求上下文管理模块

说明：
- 使用Python contextvars在请求级别存储和访问数据
- 主要用于存储从HTTP请求头提取的用户ID
- 线程安全，支持异步环境

使用示例：
    # 设置用户ID（在中间件中）
    set_current_user_id("67f8a1b2c3d4e5f6a7b8c9d0")
    
    # 获取用户ID（在MCP工具中）
    user_id = get_current_user_id()
"""

from contextvars import ContextVar
from typing import Optional

# 请求级别的用户ID上下文变量
_current_user_id: ContextVar[Optional[str]] = ContextVar('current_user_id', default=None)


def set_current_user_id(user_id: Optional[str]) -> None:
    """
    设置当前请求的用户ID
    
    Args:
        user_id: LibreChat用户ID (MongoDB ObjectId字符串)
    """
    _current_user_id.set(user_id)


def get_current_user_id() -> Optional[str]:
    """
    获取当前请求的用户ID
    
    Returns:
        用户ID字符串，如果未设置则返回None
    """
    return _current_user_id.get()


def clear_current_user_id() -> None:
    """
    清除当前请求的用户ID
    通常在请求结束时调用
    """
    _current_user_id.set(None)

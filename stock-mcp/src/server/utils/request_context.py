# src/server/utils/request_context.py
"""
请求上下文管理模块

说明：
- 使用Python contextvars在请求级别存储和访问数据
- 主要用于存储从HTTP请求头提取的用户ID
- 线程安全，支持异步环境
- 支持ObjectId到邮箱的自动解析

使用示例：
    # 设置用户ID（在中间件中）
    set_current_user_id("937585404@qq.com")
    
    # 获取用户ID（在MCP工具中）
    user_id = get_current_user_id()
    
    # 解析为邮箱（如果是ObjectId会自动转换）
    email = resolve_user_id_to_email()
"""

from contextvars import ContextVar
from typing import Optional

# 请求级别的用户ID上下文变量
_current_user_id: ContextVar[Optional[str]] = ContextVar('current_user_id', default=None)


def set_current_user_id(user_id: Optional[str]) -> None:
    """
    设置当前请求的用户ID
    
    Args:
        user_id: 用户ID (优先使用邮箱，也可以是MongoDB ObjectId)
    """
    _current_user_id.set(user_id)


def get_current_user_id() -> Optional[str]:
    """
    获取当前请求的用户ID
    
    Returns:
        用户ID字符串，如果未设置则返回None
    """
    return _current_user_id.get()


def resolve_user_id_to_email() -> Optional[str]:
    """
    解析当前用户ID为邮箱
    
    如果当前用户ID是ObjectId，尝试从映射表解析为邮箱。
    如果无法解析，返回原始ID。
    
    Returns:
        用户邮箱或原始ID
    """
    user_id = get_current_user_id()
    if not user_id:
        return None
    
    # 如果已经是邮箱格式，直接返回
    if '@' in user_id:
        return user_id
    
    # 尝试从resolver解析
    try:
        from src.server.utils.user_id_resolver import get_user_id_resolver
        resolver = get_user_id_resolver()
        return resolver.resolve(user_id)
    except Exception:
        # 如果解析失败，返回原始ID
        return user_id


def clear_current_user_id() -> None:
    """
    清除当前请求的用户ID
    通常在请求结束时调用
    """
    _current_user_id.set(None)


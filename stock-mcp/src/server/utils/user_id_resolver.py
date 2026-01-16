# src/server/utils/user_id_resolver.py
"""
用户ID解析服务

职责:
- 从JWT token中提取用户邮箱
- 建立ObjectId到邮箱的映射关系
- 提供统一的用户标识符解析接口

使用示例:
    # 在中间件中注册映射
    resolver = get_user_id_resolver()
    resolver.register_from_jwt(objectid, jwt_token)
    
    # 在工具中解析为邮箱
    email = resolver.resolve(objectid)  # 返回邮箱
"""

import base64
import json
import logging
from typing import Optional, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class UserIdResolver:
    """用户ID解析器"""
    
    def __init__(self):
        # ObjectId → Email 映射缓存
        self._id_to_email: Dict[str, str] = {}
        # 缓存过期时间（默认24小时）
        self._cache_ttl = timedelta(hours=24)
        # 缓存时间戳
        self._cache_timestamps: Dict[str, datetime] = {}
    
    def register_from_jwt(self, user_id: str, jwt_token: str) -> Optional[str]:
        """
        从JWT token中提取邮箱并注册映射
        
        Args:
            user_id: 用户ID（可能是ObjectId或邮箱）
            jwt_token: JWT token字符串
            
        Returns:
            提取的邮箱，如果失败则返回None
        """
        try:
            # 提取JWT payload（第二部分）
            parts = jwt_token.split('.')
            if len(parts) != 3:
                logger.warning(f"Invalid JWT format: expected 3 parts, got {len(parts)}")
                return None
            
            payload_encoded = parts[1]
            
            # 添加padding（JWT可能缺少=）
            padding = 4 - len(payload_encoded) % 4
            if padding != 4:
                payload_encoded += '=' * padding
            
            # Base64解码
            payload_bytes = base64.b64decode(payload_encoded)
            payload = json.loads(payload_bytes)
            
            # 提取邮箱
            email = payload.get('email')
            objectid = payload.get('id')
            
            if email and objectid:
                # 注册映射
                self._id_to_email[objectid] = email
                self._cache_timestamps[objectid] = datetime.now()
                
                logger.info(f"✅ Registered user mapping: {objectid} → {email}")
                return email
            elif email:
                logger.warning(f"JWT contains email but no id: {email}")
                return email
            else:
                logger.warning("JWT payload missing 'email' field")
                return None
                
        except Exception as e:
            logger.error(f"Failed to parse JWT token: {e}", exc_info=True)
            return None
    
    def resolve(self, user_id: str) -> str:
        """
        解析用户ID为邮箱
        
        Args:
            user_id: 输入的用户ID（可能是ObjectId或邮箱）
            
        Returns:
            用户邮箱。如果无法解析，返回原始user_id
        """
        if not user_id:
            return user_id
        
        # 如果已经是邮箱格式，直接返回
        if '@' in user_id:
            return user_id
        
        # 检查缓存
        email = self._id_to_email.get(user_id)
        if email:
            # 检查缓存是否过期
            timestamp = self._cache_timestamps.get(user_id)
            if timestamp and datetime.now() - timestamp < self._cache_ttl:
                logger.debug(f"Cache hit: {user_id} → {email}")
                return email
            else:
                # 缓存过期，清理
                logger.debug(f"Cache expired for {user_id}")
                self._id_to_email.pop(user_id, None)
                self._cache_timestamps.pop(user_id, None)
        
        # 无法解析，返回原始ID
        logger.debug(f"Cannot resolve {user_id}, returning as-is")
        return user_id
    
    def clear_cache(self):
        """清空缓存"""
        self._id_to_email.clear()
        self._cache_timestamps.clear()
        logger.info("User ID mapping cache cleared")


# 全局单例
_resolver: Optional[UserIdResolver] = None


def get_user_id_resolver() -> UserIdResolver:
    """获取全局UserIdResolver实例"""
    global _resolver
    if _resolver is None:
        _resolver = UserIdResolver()
    return _resolver

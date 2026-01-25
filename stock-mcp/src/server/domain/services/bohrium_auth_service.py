"""
Bohrium Authentication Service - 玻尔API认证服务

功能：
1. 从cookie中提取appAccessKey和clientName
2. 调用玻尔SDK验证身份并获取userid
3. 提供缓存机制减少API调用

架构设计（修改为使用官方SDK）：
- 使用 bohrium-open-sdk 官方SDK（与AS项目一致）
- 封装SDK调用逻辑
- 提供统一的错误处理
- 支持TTL缓存机制
"""

import os
import time
import asyncio
from typing import Optional, Dict, Tuple

# 清除代理环境变量（避免SDK连接本地代理）
# httpx（SDK依赖）不支持socks5h协议，且本地代理会导致连接失败
_proxy_vars = ['ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']
for proxy_var in _proxy_vars:
    if proxy_var in os.environ:
        del os.environ[proxy_var]

# 添加 NO_PROXY 确保直连
os.environ['NO_PROXY'] = '*'

from bohrium_open_sdk import OpenSDK
from src.server.utils.logger import logger


class BohriumAuthService:
    """玻尔API认证服务（使用官方SDK）"""

    CACHE_TTL = 3600  # 缓存过期时间：1小时（秒）
    FAIL_CACHE_TTL = 300  # 失败缓存时间：5分钟（避免反复重试）

    def __init__(self):
        """初始化认证服务"""
        # 缓存结构: {(access_key, app_key): (user_id, timestamp)}
        # user_id为None表示认证失败
        self._cache: Dict[Tuple[str, str], Tuple[Optional[str], float]] = {}
        logger.info("[BohriumAuthService] Service initialized with OpenSDK and TTL cache")

    async def authenticate(
        self,
        app_access_key: str,
        client_name: str
    ) -> Optional[str]:
        """
        通过玻尔API验证用户身份并获取userid

        Args:
            app_access_key: 应用访问密钥
            client_name: 客户端名称

        Returns:
            Optional[str]: 用户ID（bohr_user_id），失败返回None
        """
        try:
            cache_key = (app_access_key, client_name)
            current_time = time.time()

            # 检查缓存及过期时间
            if cache_key in self._cache:
                cached_userid, cached_time = self._cache[cache_key]

                # 判断是否过期
                if cached_userid is not None:
                    # 成功缓存：1小时TTL
                    if current_time - cached_time < self.CACHE_TTL:
                        logger.debug(f"[BohriumAuthService] Cache hit (success) for client: {client_name}")
                        return cached_userid
                    else:
                        logger.debug(f"[BohriumAuthService] Cache expired for client: {client_name}")
                else:
                    # 失败缓存：5分钟TTL
                    if current_time - cached_time < self.FAIL_CACHE_TTL:
                        logger.debug(f"[BohriumAuthService] Cache hit (failure) for client: {client_name}, skip retry")
                        return None
                    else:
                        logger.debug(f"[BohriumAuthService] Failure cache expired, retry authentication")

            logger.info(f"[BohriumAuthService] Authenticating with Bohrium API for client: {client_name}")

            # 调用玻尔API
            userid = await self._call_bohrium_api(app_access_key, client_name)

            # 缓存结果（成功或失败都缓存）
            self._cache[cache_key] = (userid, current_time)

            if userid:
                logger.info(f"[BohriumAuthService] ✅ Authentication successful, userid: {userid}, cached for 1h")
            else:
                logger.warning(f"[BohriumAuthService] ⚠️ Authentication failed, cached for 5min to avoid retry")

            return userid

        except Exception as e:
            logger.error(f"[BohriumAuthService] Authentication error: {e}", exc_info=True)
            # 异常也缓存，避免反复重试
            cache_key = (app_access_key, client_name)
            self._cache[cache_key] = (None, time.time())
            return None

    async def _call_bohrium_api(
        self,
        app_access_key: str,
        client_name: str
    ) -> Optional[str]:
        """
        调用玻尔SDK获取用户信息（内部方法）

        使用官方 bohrium-open-sdk，与AS项目保持一致

        Args:
            app_access_key: 应用访问密钥
            client_name: 客户端名称（app_key）

        Returns:
            Optional[str]: 用户ID（user_id字符串，如 "6z023dyl"）

        SDK响应格式:
        {
            "code": 0,
            "data": {
                "user_id": "6z023dyl",
                "name": "Ventus Shaw",
                "bohr_user_id": 1493480,
                "org_id": 123
            }
        }
        """
        try:
            # 使用官方SDK（同步调用，需要在线程池中执行避免阻塞事件循环）
            def _sync_sdk_call():
                client = OpenSDK(access_key=app_access_key, app_key=client_name)
                return client.user.get_info()

            # 在线程池中执行同步SDK调用
            result = await asyncio.to_thread(_sync_sdk_call)

            logger.debug(f"[BohriumAuthService] SDK response: {result}")

            # 检查返回结果
            if result.get("code") != 0:
                error_msg = result.get("message", "未知错误")
                logger.error(f"[BohriumAuthService] SDK returned error: {error_msg}")
                return None

            logger.debug("[BohriumAuthService] SDK response code is 0 (success)")

            # 提取user_id（使用字符串，与AS项目一致）
            data = result.get("data", {})

            if not isinstance(data, dict):
                logger.warning(f"[BohriumAuthService] Invalid data type: {type(data)}")
                return None

            # 统一使用 user_id 字符串（如 "6z023dyl"）
            user_id = data.get("user_id")
            if user_id:
                logger.debug(f"[BohriumAuthService] ✅ Extracted user_id: {user_id}")
                return str(user_id)

            logger.warning("[BohriumAuthService] No user_id found in SDK response")
            logger.debug(f"[BohriumAuthService] Available fields: {list(data.keys())}")
            return None

        except Exception as e:
            logger.error(f"[BohriumAuthService] SDK call error: {e}", exc_info=True)
            return None

    def clear_cache(self):
        """清空认证缓存"""
        self._cache.clear()
        logger.info("[BohriumAuthService] Cache cleared")

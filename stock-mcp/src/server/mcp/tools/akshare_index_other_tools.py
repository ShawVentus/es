# /root/stock-mcp/src/server/mcp/tools/akshare_index_other_tools.py
"""AKShare 指数及其他数据 MCP 工具集

本模块提供8个数据接口的MCP工具封装:
- A股指数历史行情
- 中证指数
- 美股指数行情
- 上证50股指期权波动率指数
- A股新闻情绪指数
- QDII欧美指数
- QDII亚洲指数
- 空气质量历史数据

所有数据自动保存到用户隔离目录: /root/librechat_user_data/{user_id}/dataset/
文件名采用中文命名,便于识别。
"""

from typing import Any, Dict
import akshare as ak
import pandas as pd
from fastmcp import FastMCP
from src.server.utils.logger import logger
from src.server.utils.request_context import get_current_user_id
from src.server.config.category_mapping import get_category
from src.server.utils.data_cleaner import clean_csv_for_storage
import os
import time

# 数据源映射表
DATA_SOURCE_MAP = {
    "stock_zh_index_daily": "新浪财经/东方财富/腾讯证券",
    "stock_zh_index_hist_csindex": "中证指数",
    "index_us_stock_sina": "新浪财经",
    "index_option_50index_qvix": "期权论坛",
    "index_news_sentiment_scope": "数据提供商",
    "qdii_e_index_jsl": "集思录",
    "qdii_a_index_jsl": "集思录",
    "air_quality_hist": "真气网",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "stock_zh_index_daily": "A股指数历史行情",
    "stock_zh_index_hist_csindex": "中证指数",
    "index_us_stock_sina": "美股指数行情",
    "index_option_50index_qvix": "上证50股指期权波动率指数",
    "index_news_sentiment_scope": "A股新闻情绪指数",
    "qdii_e_index_jsl": "QDII欧美指数",
    "qdii_a_index_jsl": "QDII亚洲指数",
    "air_quality_hist": "空气质量历史数据",
}



def _save_data(df: pd.DataFrame, function_name: str) -> str:
    """
    保存数据到用户目录（使用DatasetManager）
    
    Args:
        df: 要保存的DataFrame
        function_name: 函数名称（用于获取中文名称和分类）
    
    Returns:
        保存的文件路径
    """
    from src.server.core.dataset_manager import get_dataset_manager
    
    # 获取当前用户ID
    user_id = get_current_user_id() or "anonymous"
    
    # 获取中文名称和分类
    chinese_name = CHINESE_NAME_MAP.get(function_name, function_name)
    category = get_category(function_name)
    
    # 使用 DatasetManager 保存（会自动生成元数据）
    dataset_mgr = get_dataset_manager()
    result = dataset_mgr.save_dataset(
        user_id=user_id,
        df=df,
        filename=chinese_name,
        category=category
    )
    
    # 构建文件路径
    base_dir = f"/root/librechat_user_data/{user_id}/dataset"
    file_path = os.path.join(base_dir, f"{chinese_name}.csv")
    
    if not result.get("success"):
        # DatasetManager 失败时的 fallback 逻辑
        logger.error(f"Failed to save dataset via DatasetManager: {result.get('error')}")
        logger.warning(f"Falling back to direct CSV save for {chinese_name}")
        
        # 确保目录存在
        os.makedirs(base_dir, exist_ok=True)
        
        # 直接保存 CSV（不生成元数据）
        df.to_csv(file_path, index=False, encoding='utf-8-sig')
        logger.info(f"Data saved (fallback mode) to {file_path}")
    else:
        logger.info(f"Data saved to {file_path}")
    return file_path



def _call_akshare_with_retry(func, max_retries=3, initial_delay=1.0):
    """
    使用指数退避策略调用AKShare接口

    针对SSL错误进行特殊处理:
    - 检测 SSLError/SSLEOFError
    - 增加重试次数（SSL错误通常是暂时性的）
    - 提供详细的错误诊断信息

    Args:
        func: AKShare接口函数
        max_retries: 最大重试次数
        initial_delay: 初始延迟秒数

    Returns:
        DataFrame或抛出异常
    """
    delay = initial_delay
    last_exception = None

    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            last_exception = e
            error_msg = str(e)

            # 检测SSL相关错误
            is_ssl_error = any([
                "SSL" in error_msg,
                "ssl" in error_msg.lower(),
                "UNEXPECTED_EOF_WHILE_READING" in error_msg,
                "SSLEOFError" in error_msg,
                "certificate" in error_msg.lower()
            ])

            if is_ssl_error:
                logger.warning(
                    f"🔐 检测到SSL错误 (尝试 {attempt + 1}/{max_retries}): "
                    f"{error_msg[:100]}... "
                    f"可能原因: 1)目标网站SSL证书问题 2)网络代理干扰 3)防火墙拦截"
                )
            else:
                logger.warning(f"AKShare调用失败 (尝试 {attempt + 1}/{max_retries}): {e}")

            if attempt < max_retries - 1:
                logger.info(f"等待 {delay}秒 后重试...")
                time.sleep(delay)
                delay *= 2  # 指数退避
            else:
                if is_ssl_error:
                    logger.error(
                        f"❌ SSL错误持续存在,已达最大重试次数。\n"
                        f"   建议: 1) 检查是否开启了代理/VPN\n"
                        f"        2) 尝试关闭代理软件\n"
                        f"        3) 稍后再试（可能是目标网站维护）\n"
                        f"        4) 检查防火墙设置"
                    )
                else:
                    logger.error(f"AKShare调用失败,已达最大重试次数: {e}")

    raise last_exception


def register_akshare_index_other_tools(mcp: FastMCP):
    """注册AKShare指数及其他数据工具"""

    # ==================== 指数数据 (5个) ====================

    @mcp.tool(tags={"akshare", "index", "china"})
    async def stock_zh_index_daily() -> Dict[str, Any]:
        """获取A股指数历史行情数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.stock_zh_index_daily())
            file_path = _save_data(df, "stock_zh_index_daily")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["stock_zh_index_daily"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["stock_zh_index_daily"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取A股指数历史行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "index", "china"})
    async def stock_zh_index_hist_csindex() -> Dict[str, Any]:
        """获取中证指数数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.stock_zh_index_hist_csindex())
            file_path = _save_data(df, "stock_zh_index_hist_csindex")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["stock_zh_index_hist_csindex"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["stock_zh_index_hist_csindex"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取中证指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "index", "usa"})
    async def index_us_stock_sina() -> Dict[str, Any]:
        """获取美股指数行情数据(新浪财经)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.index_us_stock_sina())
            file_path = _save_data(df, "index_us_stock_sina")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["index_us_stock_sina"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["index_us_stock_sina"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美股指数行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "index", "option", "china"})
    async def index_option_50index_qvix() -> Dict[str, Any]:
        """获取上证50股指期权波动率指数数据(期权论坛)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.index_option_50index_qvix())
            file_path = _save_data(df, "index_option_50index_qvix")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["index_option_50index_qvix"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["index_option_50index_qvix"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取上证50股指期权波动率指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "index", "sentiment", "china"})
    async def index_news_sentiment_scope() -> Dict[str, Any]:
        """获取A股新闻情绪指数数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.index_news_sentiment_scope())
            file_path = _save_data(df, "index_news_sentiment_scope")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["index_news_sentiment_scope"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["index_news_sentiment_scope"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取A股新闻情绪指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    # ==================== 其他数据 (3个) ====================

    @mcp.tool(tags={"akshare", "qdii"})
    async def qdii_e_index_jsl() -> Dict[str, Any]:
        """获取QDII欧美指数数据(集思录)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.qdii_e_index_jsl())
            file_path = _save_data(df, "qdii_e_index_jsl")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["qdii_e_index_jsl"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["qdii_e_index_jsl"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取QDII欧美指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "qdii"})
    async def qdii_a_index_jsl() -> Dict[str, Any]:
        """获取QDII亚洲指数数据(集思录)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.qdii_a_index_jsl())
            file_path = _save_data(df, "qdii_a_index_jsl")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["qdii_a_index_jsl"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["qdii_a_index_jsl"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取QDII亚洲指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "environment"})
    async def air_quality_hist() -> Dict[str, Any]:
        """获取空气质量历史数据(真气网)

        注意: 该接口依赖第三方网站(www.zq12369.com),可能因SSL证书问题或网站维护而暂时不可用。
        如遇到SSL错误,建议稍后重试或使用其他环境数据源。

        常见SSL错误排查:
        1. 检查是否开启了代理/VPN（尝试关闭）
        2. 检查防火墙设置（是否拦截了HTTPS流量）
        3. 稍后重试（可能是网站维护）
        4. 网络环境问题（切换网络试试）
        """
        try:
            df = _call_akshare_with_retry(lambda: ak.air_quality_hist(), max_retries=5)
            file_path = _save_data(df, "air_quality_hist")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["air_quality_hist"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["air_quality_hist"],
                "record_count": len(df)
            }
        except Exception as e:
            error_msg = str(e)
            logger.error(f"获取空气质量历史数据失败: {e}")

            # 详细检测错误类型
            is_ssl_eof = "UNEXPECTED_EOF_WHILE_READING" in error_msg
            is_ssl_cert = "certificate" in error_msg.lower()
            is_ssl_general = "SSL" in error_msg or "ssl" in error_msg.lower()
            is_connection = "Connection" in error_msg or "Timeout" in error_msg

            # 生成诊断建议
            diagnostic_steps = []
            if is_ssl_eof:
                diagnostic_steps = [
                    "🔍 SSL握手中断 (UNEXPECTED_EOF_WHILE_READING)",
                    "✅ 1. 检查是否开启了代理/VPN → 尝试关闭代理",
                    "✅ 2. 检查防火墙是否拦截 www.zq12369.com",
                    "✅ 3. 切换网络环境（如切换WiFi/4G）",
                    "✅ 4. 稍后重试（可能是网站临时维护）"
                ]
            elif is_ssl_cert:
                diagnostic_steps = [
                    "🔍 SSL证书验证失败",
                    "✅ 1. 目标网站证书可能过期或配置错误",
                    "✅ 2. 中间代理修改了证书（关闭代理试试）"
                ]
            elif is_connection:
                diagnostic_steps = [
                    "🔍 网络连接问题",
                    "✅ 1. 检查网络连接是否正常",
                    "✅ 2. 尝试访问其他网站验证网络",
                    "✅ 3. 检查DNS设置"
                ]
            else:
                diagnostic_steps = ["未知错误类型，请联系管理员"]

            return {
                "success": False,
                "error": error_msg,
                "error_type": "ssl_eof_error" if is_ssl_eof else ("ssl_cert_error" if is_ssl_cert else "connection_error" if is_connection else "general_error"),
                "data_source": "www.zq12369.com (真气网)",
                "diagnostic": diagnostic_steps,
                "quick_fix": "尝试关闭代理/VPN后重试" if is_ssl_eof else "稍后重试",
                "alternative": "暂无替代数据源（真气网独家数据）",
                "curl_test": "curl -I https://www.zq12369.com/api/newzhenqiapi.php"
            }

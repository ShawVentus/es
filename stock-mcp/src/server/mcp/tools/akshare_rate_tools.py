# /root/stock-mcp/src/server/mcp/tools/akshare_rate_tools.py
"""AKShare 利率数据 MCP 工具集

本模块提供4个利率数据接口的MCP工具封装:
- 美联储利率决议
- 中国央行利率决议
- 银行间拆借利率
- 回购定盘利率历史

所有数据自动保存到用户隔离目录: /root/librechat_user_data/{user_id}/dataset/
文件名采用中文命名,便于识别。
"""

from typing import Any, Dict
import akshare as ak
import pandas as pd
from fastmcp import FastMCP
from src.server.utils.logger import logger
from src.server.utils.request_context import get_current_user_id
from src.server.utils.data_cleaner import clean_csv_for_storage
import os
import time

# 数据源映射表
DATA_SOURCE_MAP = {
    "macro_bank_usa_interest_rate": "金十数据",
    "macro_bank_china_interest_rate": "金十数据",
    "rate_interbank": "东方财富",
    "repo_rate_hist": "金融数据提供商",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "macro_bank_usa_interest_rate": "美联储利率决议",
    "macro_bank_china_interest_rate": "中国央行利率决议",
    "rate_interbank": "银行间拆借利率",
    "repo_rate_hist": "回购定盘利率历史",
}


def _save_data(df: pd.DataFrame, function_name: str) -> str:
    """
    保存数据到用户目录

    Args:
        df: 要保存的DataFrame
        function_name: 函数名称(用于获取中文名称)

    Returns:
        保存的文件路径
    """
    # 获取当前用户ID
    user_id = get_current_user_id() or "anonymous"

    # 生成文件路径
    chinese_name = CHINESE_NAME_MAP.get(function_name, function_name)
    base_dir = f"/root/librechat_user_data/{user_id}/dataset"
    os.makedirs(base_dir, exist_ok=True)

    file_path = os.path.join(base_dir, f"{chinese_name}.csv")

    # 清洗数据：删除空值，规范化日期
    df_cleaned = clean_csv_for_storage(df)

    # 保存CSV
    df_cleaned.to_csv(file_path, index=False, encoding='utf-8-sig')

    logger.info(f"Data saved to {file_path}")
    return file_path


def _call_akshare_with_retry(func, max_retries=3, initial_delay=1.0):
    """
    使用指数退避策略调用AKShare接口

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
            if attempt < max_retries - 1:
                logger.warning(f"AKShare调用失败 (尝试 {attempt + 1}/{max_retries}): {e}, {delay}秒后重试")
                time.sleep(delay)
                delay *= 2  # 指数退避
            else:
                logger.error(f"AKShare调用失败,已达最大重试次数: {e}")

    raise last_exception


def register_akshare_rate_tools(mcp: FastMCP):
    """注册AKShare利率数据工具"""

    @mcp.tool(tags={"akshare", "rate", "usa"})
    async def macro_bank_usa_interest_rate() -> Dict[str, Any]:
        """获取美联储利率决议数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_bank_usa_interest_rate())
            file_path = _save_data(df, "macro_bank_usa_interest_rate")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_bank_usa_interest_rate"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_bank_usa_interest_rate"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美联储利率决议数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "rate", "china"})
    async def macro_bank_china_interest_rate() -> Dict[str, Any]:
        """获取中国央行利率决议数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_bank_china_interest_rate())
            file_path = _save_data(df, "macro_bank_china_interest_rate")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_bank_china_interest_rate"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_bank_china_interest_rate"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取中国央行利率决议数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "rate", "china"})
    async def rate_interbank() -> Dict[str, Any]:
        """获取银行间拆借利率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.rate_interbank())
            file_path = _save_data(df, "rate_interbank")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["rate_interbank"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["rate_interbank"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取银行间拆借利率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "rate", "china"})
    async def repo_rate_hist() -> Dict[str, Any]:
        """获取回购定盘利率历史数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.repo_rate_hist())
            file_path = _save_data(df, "repo_rate_hist")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["repo_rate_hist"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["repo_rate_hist"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取回购定盘利率历史数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

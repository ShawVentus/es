# /root/stock-mcp/src/server/mcp/tools/akshare_derivatives_tools.py
"""AKShare 期货期权数据 MCP 工具集

本模块提供3个期货期权数据接口的MCP工具封装:
- 期货连续合约
- 金融期权行情
- 商品期权历史行情

所有数据自动保存到用户隔离目录: $LIBRECHAT_USER_DATA_DIR/{user_id}/dataset/
文件名采用中文命名,便于识别。
"""

from typing import Any, Dict
import akshare as ak
import pandas as pd
from fastmcp import FastMCP
from src.server.utils.logger import logger
from src.server.utils.request_context import get_user_id_from_mcp_request
from src.server.utils.data_cleaner import clean_csv_for_storage
from src.server.utils.storage_paths import STORAGE_ROOT_STR
import os
import time

# 数据源映射表
DATA_SOURCE_MAP = {
    "futures_main_sina": "新浪财经",
    "option_finance_board": "交易所/新浪财经/东方财富",
    "option_commodity_hist_sina": "新浪财经",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "futures_main_sina": "期货连续合约",
    "option_finance_board": "金融期权行情",
    "option_commodity_hist_sina": "商品期权历史行情",
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
    user_id = get_user_id_from_mcp_request()
    if not user_id:
        raise ValueError("未授权：无法获取用户ID，请确保已通过 LibreChat 登录")

    # 生成文件路径
    chinese_name = CHINESE_NAME_MAP.get(function_name, function_name)
    base_dir = f"{STORAGE_ROOT_STR}/{user_id}/dataset"
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


def register_akshare_derivatives_tools(mcp: FastMCP):
    """注册AKShare期货期权数据工具"""

    @mcp.tool(tags={"akshare", "futures"})
    async def futures_main_sina() -> Dict[str, Any]:
        """获取期货连续合约数据(新浪财经)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.futures_main_sina())
            file_path = _save_data(df, "futures_main_sina")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["futures_main_sina"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["futures_main_sina"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取期货连续合约数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "option"})
    async def option_finance_board() -> Dict[str, Any]:
        """获取金融期权行情数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.option_finance_board())
            file_path = _save_data(df, "option_finance_board")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["option_finance_board"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["option_finance_board"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取金融期权行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "option"})
    async def option_commodity_hist_sina() -> Dict[str, Any]:
        """获取商品期权历史行情数据(新浪财经)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.option_commodity_hist_sina())
            file_path = _save_data(df, "option_commodity_hist_sina")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["option_commodity_hist_sina"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["option_commodity_hist_sina"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取商品期权历史行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

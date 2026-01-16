# /root/stock-mcp/src/server/mcp/tools/akshare_forex_tools.py
"""AKShare 外汇数据 MCP 工具集

本模块提供4个外汇数据接口的MCP工具封装:
- 外汇历史行情
- 人民币汇率中间价
- 人民币牌价数据
- 人民币外汇远掉报价

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
    "forex_hist_em": "东方财富",
    "currency_boc_safe": "国家外汇管理局",
    "currency_boc_sina": "新浪财经",
    "fx_swap_quote": "金融数据提供商",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "forex_hist_em": "外汇历史行情",
    "currency_boc_safe": "人民币汇率中间价",
    "currency_boc_sina": "人民币牌价数据",
    "fx_swap_quote": "人民币外汇远掉报价",
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


def register_akshare_forex_tools(mcp: FastMCP):
    """注册AKShare外汇数据工具"""

    @mcp.tool(tags={"akshare", "forex"})
    async def forex_hist_em() -> Dict[str, Any]:
        """获取外汇历史行情数据(东方财富)

        注意: 该接口依赖东方财富外汇数据，当前AKShare版本存在已知问题。
        如遇错误，建议使用 currency_boc_safe (人民币汇率中间价) 作为替代。
        """
        try:
            df = _call_akshare_with_retry(lambda: ak.forex_hist_em())
            file_path = _save_data(df, "forex_hist_em")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["forex_hist_em"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["forex_hist_em"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取外汇历史行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_type": "akshare_upstream_issue",
                "suggestion": "该接口当前不可用，建议使用 currency_boc_safe 获取人民币汇率数据"
            }

    @mcp.tool(tags={"akshare", "forex", "china"})
    async def currency_boc_safe() -> Dict[str, Any]:
        """获取人民币汇率中间价数据(国家外汇管理局)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.currency_boc_safe())
            file_path = _save_data(df, "currency_boc_safe")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["currency_boc_safe"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["currency_boc_safe"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取人民币汇率中间价数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "forex", "china"})
    async def currency_boc_sina() -> Dict[str, Any]:
        """获取人民币牌价数据(新浪财经)

        注意: 该接口依赖新浪财经数据，当前AKShare版本存在数据格式变更问题。
        如遇错误，建议使用 currency_boc_safe (人民币汇率中间价) 作为替代。
        """
        try:
            df = _call_akshare_with_retry(lambda: ak.currency_boc_sina())
            file_path = _save_data(df, "currency_boc_sina")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["currency_boc_sina"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["currency_boc_sina"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取人民币牌价数据失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "error_type": "akshare_upstream_issue",
                "suggestion": "该接口当前不可用（数据格式已变更），建议使用 currency_boc_safe 获取人民币汇率数据"
            }

    @mcp.tool(tags={"akshare", "forex", "china"})
    async def fx_swap_quote() -> Dict[str, Any]:
        """获取人民币外汇远掉报价数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.fx_swap_quote())
            file_path = _save_data(df, "fx_swap_quote")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["fx_swap_quote"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["fx_swap_quote"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取人民币外汇远掉报价数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

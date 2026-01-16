# /root/stock-mcp/src/server/mcp/tools/akshare_bond_spot_tools.py
"""AKShare 债券与现货数据 MCP 工具集

本模块提供3个数据接口的MCP工具封装:
- 现券市场成交行情 (债券)
- 国债及其他债券收益率曲线 (债券)
- 上海黄金交易所历史行情 (现货)

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
    "bond_spot_deal": "中国货币网",
    "bond_china_yield": "中国货币网",
    "spot_hist_sge": "上海黄金交易所",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "bond_spot_deal": "现券市场成交行情",
    "bond_china_yield": "国债及其他债券收益率曲线",
    "spot_hist_sge": "上海黄金交易所历史行情",
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


def register_akshare_bond_spot_tools(mcp: FastMCP):
    """注册AKShare债券与现货数据工具"""

    @mcp.tool(tags={"akshare", "bond"})
    async def bond_spot_deal() -> Dict[str, Any]:
        """获取现券市场成交行情数据(中国货币网)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.bond_spot_deal())
            file_path = _save_data(df, "bond_spot_deal")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["bond_spot_deal"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["bond_spot_deal"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取现券市场成交行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "bond"})
    async def bond_china_yield() -> Dict[str, Any]:
        """获取国债及其他债券收益率曲线数据(中国货币网)"""
        try:
            df = _call_akshare_with_retry(lambda: ak.bond_china_yield())
            file_path = _save_data(df, "bond_china_yield")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["bond_china_yield"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["bond_china_yield"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取国债及其他债券收益率曲线数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "spot", "gold"})
    async def spot_hist_sge() -> Dict[str, Any]:
        """获取上海黄金交易所历史行情数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.spot_hist_sge())
            file_path = _save_data(df, "spot_hist_sge")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["spot_hist_sge"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["spot_hist_sge"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取上海黄金交易所历史行情数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

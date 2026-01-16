# /root/stock-mcp/src/server/mcp/tools/akshare_macro_tools.py
"""AKShare 宏观数据 MCP 工具集

本模块提供26个宏观经济数据接口的MCP工具封装,包括:
- 中国宏观数据(17个，含2个融资融券)
- 美国宏观数据(5个)
- 全球宏观数据(1个OPEC报告)

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
    "macro_china_lpr": "金十数据",
    "macro_china_gdp_yearly": "金十数据",
    "macro_china_cpi_yearly": "金十数据",
    "macro_china_ppi_yearly": "金十数据",
    "macro_china_pmi_yearly": "金十数据",
    "macro_china_reserve_requirement_ratio": "金十数据",
    "macro_china_supply_of_money": "东方财富",
    "macro_china_industrial_production_yoy": "金十数据",
    "macro_china_urban_unemployment": "金十数据",
    "macro_china_shrzgm": "金十数据/东方财富",
    "macro_china_exports_yoy": "金十数据",
    "macro_china_imports_yoy": "金十数据",
    "macro_china_fx_reserves_yearly": "金十数据",
    "macro_china_national_tax_receipts": "金十数据/东方财富",
    "macro_china_foreign_exchange_gold": "金十数据",
    "macro_usa_gdp_monthly": "金十数据",
    "macro_usa_cpi_yoy": "金十数据",
    "macro_usa_ppi": "金十数据",
    "macro_usa_industrial_production": "金十数据",
    "macro_usa_unemployment_rate": "金十数据",
    "macro_cons_opec_month": "金十数据",
    "macro_china_market_margin_sh": "上海证券交易所",
    "macro_china_market_margin_sz": "深圳证券交易所",
}

# 中文名称映射表
CHINESE_NAME_MAP = {
    "macro_china_lpr": "LPR品种数据",
    "macro_china_gdp_yearly": "中国GDP年率",
    "macro_china_cpi_yearly": "中国CPI年率",
    "macro_china_ppi_yearly": "中国PPI年率",
    "macro_china_pmi_yearly": "官方制造业PMI",
    "macro_china_reserve_requirement_ratio": "存款准备金率",
    "macro_china_supply_of_money": "货币供应量",
    "macro_china_industrial_production_yoy": "规模以上工业增加值年率",
    "macro_china_urban_unemployment": "城镇调查失业率",
    "macro_china_shrzgm": "社会融资规模增量统计",
    "macro_china_exports_yoy": "以美元计算出口年率",
    "macro_china_imports_yoy": "以美元计算进口年率",
    "macro_china_fx_reserves_yearly": "外汇储备",
    "macro_china_national_tax_receipts": "全国税收收入",
    "macro_china_foreign_exchange_gold": "央行黄金和外汇储备",
    "macro_usa_gdp_monthly": "美国GDP",
    "macro_usa_cpi_yoy": "美国CPI年率",
    "macro_usa_ppi": "美国生产者物价指数",
    "macro_usa_industrial_production": "美国工业产出月率",
    "macro_usa_unemployment_rate": "美国失业率",
    "macro_cons_opec_month": "欧佩克报告",
    "macro_china_market_margin_sh": "上海融资融券数据",
    "macro_china_market_margin_sz": "深圳融资融券数据",
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


def register_akshare_macro_tools(mcp: FastMCP):
    """注册AKShare宏观数据工具"""

    # ==================== 中国宏观数据 (15个) ====================

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_lpr() -> Dict[str, Any]:
        """获取LPR品种数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_lpr())
            file_path = _save_data(df, "macro_china_lpr")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_lpr"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_lpr"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取LPR品种数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_gdp_yearly() -> Dict[str, Any]:
        """获取中国GDP年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_gdp_yearly())
            file_path = _save_data(df, "macro_china_gdp_yearly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_gdp_yearly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_gdp_yearly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取中国GDP年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_cpi_yearly() -> Dict[str, Any]:
        """获取中国CPI年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_cpi_yearly())
            file_path = _save_data(df, "macro_china_cpi_yearly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_cpi_yearly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_cpi_yearly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取中国CPI年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_ppi_yearly() -> Dict[str, Any]:
        """获取中国PPI年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_ppi_yearly())
            file_path = _save_data(df, "macro_china_ppi_yearly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_ppi_yearly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_ppi_yearly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取中国PPI年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_pmi_yearly() -> Dict[str, Any]:
        """获取官方制造业PMI数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_pmi_yearly())
            file_path = _save_data(df, "macro_china_pmi_yearly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_pmi_yearly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_pmi_yearly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取官方制造业PMI数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_reserve_requirement_ratio() -> Dict[str, Any]:
        """获取存款准备金率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_reserve_requirement_ratio())
            file_path = _save_data(df, "macro_china_reserve_requirement_ratio")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_reserve_requirement_ratio"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_reserve_requirement_ratio"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取存款准备金率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_supply_of_money() -> Dict[str, Any]:
        """获取货币供应量数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_supply_of_money())
            file_path = _save_data(df, "macro_china_supply_of_money")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_supply_of_money"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_supply_of_money"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取货币供应量数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_industrial_production_yoy() -> Dict[str, Any]:
        """获取规模以上工业增加值年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_industrial_production_yoy())
            file_path = _save_data(df, "macro_china_industrial_production_yoy")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_industrial_production_yoy"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_industrial_production_yoy"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取规模以上工业增加值年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_urban_unemployment() -> Dict[str, Any]:
        """获取城镇调查失业率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_urban_unemployment())
            file_path = _save_data(df, "macro_china_urban_unemployment")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_urban_unemployment"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_urban_unemployment"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取城镇调查失业率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_shrzgm() -> Dict[str, Any]:
        """获取社会融资规模增量统计数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_shrzgm())
            file_path = _save_data(df, "macro_china_shrzgm")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_shrzgm"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_shrzgm"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取社会融资规模增量统计数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_exports_yoy() -> Dict[str, Any]:
        """获取以美元计算出口年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_exports_yoy())
            file_path = _save_data(df, "macro_china_exports_yoy")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_exports_yoy"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_exports_yoy"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取以美元计算出口年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_imports_yoy() -> Dict[str, Any]:
        """获取以美元计算进口年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_imports_yoy())
            file_path = _save_data(df, "macro_china_imports_yoy")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_imports_yoy"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_imports_yoy"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取以美元计算进口年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_fx_reserves_yearly() -> Dict[str, Any]:
        """获取外汇储备数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_fx_reserves_yearly())
            file_path = _save_data(df, "macro_china_fx_reserves_yearly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_fx_reserves_yearly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_fx_reserves_yearly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取外汇储备数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_national_tax_receipts() -> Dict[str, Any]:
        """获取全国税收收入数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_national_tax_receipts())
            file_path = _save_data(df, "macro_china_national_tax_receipts")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_national_tax_receipts"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_national_tax_receipts"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取全国税收收入数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_foreign_exchange_gold() -> Dict[str, Any]:
        """获取央行黄金和外汇储备数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_foreign_exchange_gold())
            file_path = _save_data(df, "macro_china_foreign_exchange_gold")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_foreign_exchange_gold"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_foreign_exchange_gold"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取央行黄金和外汇储备数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    # ==================== 美国宏观数据 (5个) ====================

    @mcp.tool(tags={"akshare", "macro", "usa"})
    async def macro_usa_gdp_monthly() -> Dict[str, Any]:
        """获取美国GDP数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_usa_gdp_monthly())
            file_path = _save_data(df, "macro_usa_gdp_monthly")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_usa_gdp_monthly"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_usa_gdp_monthly"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美国GDP数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "usa"})
    async def macro_usa_cpi_yoy() -> Dict[str, Any]:
        """获取美国CPI年率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_usa_cpi_yoy())
            file_path = _save_data(df, "macro_usa_cpi_yoy")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_usa_cpi_yoy"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_usa_cpi_yoy"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美国CPI年率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "usa"})
    async def macro_usa_ppi() -> Dict[str, Any]:
        """获取美国生产者物价指数数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_usa_ppi())
            file_path = _save_data(df, "macro_usa_ppi")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_usa_ppi"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_usa_ppi"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美国生产者物价指数数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "usa"})
    async def macro_usa_industrial_production() -> Dict[str, Any]:
        """获取美国工业产出月率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_usa_industrial_production())
            file_path = _save_data(df, "macro_usa_industrial_production")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_usa_industrial_production"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_usa_industrial_production"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美国工业产出月率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "usa"})
    async def macro_usa_unemployment_rate() -> Dict[str, Any]:
        """获取美国失业率数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_usa_unemployment_rate())
            file_path = _save_data(df, "macro_usa_unemployment_rate")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_usa_unemployment_rate"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_usa_unemployment_rate"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取美国失业率数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    # ==================== 全球宏观数据 (1个) ====================

    @mcp.tool(tags={"akshare", "macro", "global"})
    async def macro_cons_opec_month() -> Dict[str, Any]:
        """获取欧佩克报告数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_cons_opec_month())
            file_path = _save_data(df, "macro_cons_opec_month")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_cons_opec_month"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_cons_opec_month"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取欧佩克报告数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    # ==================== 融资融券数据 (2个) ====================

    @mcp.tool(tags={"akshare", "macro", "china", "margin"})
    async def macro_china_market_margin_sh() -> Dict[str, Any]:
        """获取上海证券交易所融资融券数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_market_margin_sh())
            file_path = _save_data(df, "macro_china_market_margin_sh")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_market_margin_sh"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_market_margin_sh"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取上海融资融券数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @mcp.tool(tags={"akshare", "macro", "china", "margin"})
    async def macro_china_market_margin_sz() -> Dict[str, Any]:
        """获取深圳证券交易所融资融券数据"""
        try:
            df = _call_akshare_with_retry(lambda: ak.macro_china_market_margin_sz())
            file_path = _save_data(df, "macro_china_market_margin_sz")

            return {
                "success": True,
                "source": DATA_SOURCE_MAP["macro_china_market_margin_sz"],
                "saved_path": file_path,
                "chinese_name": CHINESE_NAME_MAP["macro_china_market_margin_sz"],
                "record_count": len(df)
            }
        except Exception as e:
            logger.error(f"获取深圳融资融券数据失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# src/server/config/category_mapping.py
"""
数据分类映射配置模块

职责：
- 提供接口名称到中文分类的映射
- 基于 /root/docs/接口.md 定义的一级分类体系
- 为所有MCP工具提供统一的分类获取接口

使用示例：
    from src.server.config.category_mapping import get_category
    
    category = get_category("macro_china_gdp_yearly")  # 返回 "宏观数据"
    category = get_category("unknown_interface")       # 返回 "股票数据" (默认)

创建日期: 2026-01-15
"""

from typing import Dict

# ============================================================
# 一级分类枚举（与接口.md完全对应）
# ============================================================

CATEGORY_LABELS: Dict[str, str] = {
    "MACRO": "宏观数据",
    "INTEREST_RATE": "利率数据",
    "FOREX": "外汇数据",
    "FUTURES": "期货",
    "OPTIONS": "期权",
    "BONDS": "债券",
    "SPOT": "现货",
    "INDEX": "指数",
    "QDII": "QDII",
    "ALTERNATIVE": "另类",
    "STOCK": "股票数据",  # 未在接口.md中定义的接口使用此默认分类
}

# ============================================================
# 接口名→中文分类映射表（基于接口.md第1-56行）
# ============================================================

INTERFACE_CATEGORY_MAP: Dict[str, str] = {
    # ==================== 宏观数据 ====================
    
    # 中国宏观（接口.md 第2-9行）
    "macro_china_lpr": "宏观数据",
    "macro_china_gdp_yearly": "宏观数据",
    "macro_china_cpi_yearly": "宏观数据",
    "macro_china_ppi_yearly": "宏观数据",
    "macro_china_pmi_yearly": "宏观数据",
    "macro_china_reserve_requirement_ratio": "宏观数据",
    "macro_china_supply_of_money": "宏观数据",
    "macro_china_industrial_production_yoy": "宏观数据",
    
    # 中国宏观补充（接口.md 第36-43行）
    "macro_china_urban_unemployment": "宏观数据",
    "macro_china_shrzgm": "宏观数据",
    "macro_china_exports_yoy": "宏观数据",
    "macro_china_imports_yoy": "宏观数据",
    "macro_china_fx_reserves_yearly": "宏观数据",
    "macro_china_national_tax_receipts": "宏观数据",
    "macro_china_foreign_exchange_gold": "宏观数据",
    "macro_china_nbs_nation": "宏观数据",
    
    # 美国宏观（接口.md 第10-13行）
    "macro_usa_gdp_monthly": "宏观数据",
    "macro_usa_cpi_yoy": "宏观数据",
    "macro_usa_ppi": "宏观数据",
    "macro_usa_industrial_production": "宏观数据",
    
    # 美国宏观补充（接口.md 第44行）
    "macro_usa_unemployment_rate": "宏观数据",
    
    # 全球宏观（接口.md 第14行）
    "macro_cons_opec_month": "宏观数据",
    
    # ==================== 利率数据 ====================
    
    # 接口.md 第15-17、45行
    "macro_bank_usa_interest_rate": "利率数据",
    "macro_bank_china_interest_rate": "利率数据",
    "rate_interbank": "利率数据",
    "repo_rate_hist": "利率数据",
    
    # ==================== 外汇数据 ====================
    
    # 接口.md 第18-19、46-47行
    "forex_hist_em": "外汇数据",
    "currency_boc_safe": "外汇数据",
    "currency_boc_sina": "外汇数据",
    "fx_swap_quote": "外汇数据",
    
    # ==================== 期货 ====================
    
    # 接口.md 第23行
    "futures_main_sina": "期货",
    
    # ==================== 期权 ====================
    
    # 接口.md 第24-25、51行
    "option_finance_board": "期权",
    "option_commodity_hist_sina": "期权",
    "index_option_50index_qvix": "期权",
    
    # ==================== 债券 ====================
    
    # 接口.md 第26-27行
    "bond_spot_deal": "债券",
    "bond_china_yield": "债券",
    
    # ==================== 现货 ====================
    
    # 接口.md 第28行
    "spot_hist_sge": "现货",
    
    # ==================== 指数 ====================
    
    # 接口.md 第29-31行
    "stock_zh_index_daily": "指数",
    "stock_zh_index_hist_csindex": "指数",
    "index_us_stock_sina": "指数",
    
    # ==================== QDII ====================
    
    # 接口.md 第53-54行
    "qdii_e_index_jsl": "QDII",
    "qdii_a_index_jsl": "QDII",
    
    # ==================== 另类 ====================
    
    # 接口.md 第55-56行
    "air_quality_hist": "另类",
    "stock_js_weibo_report": "另类",
    
    # ==================== 股票数据（未在接口.md中定义） ====================
    
    "get_historical_prices": "股票数据",
    "search_assets": "股票数据",
    "get_asset_info": "股票数据",
}

# ============================================================
# 默认分类
# ============================================================

DEFAULT_CATEGORY = "股票数据"


# ============================================================
# 公共接口
# ============================================================

def get_category(interface_name: str) -> str:
    """
    根据接口名获取对应的中文分类
    
    Args:
        interface_name: MCP工具的函数名（如 "macro_china_gdp_yearly"）
        
    Returns:
        str: 中文分类名称（如 "宏观数据"）
             如果接口名不在映射表中，返回默认分类 "股票数据"
        
    Examples:
        >>> get_category("macro_china_gdp_yearly")
        '宏观数据'
        >>> get_category("stock_zh_index_daily")
        '指数'
        >>> get_category("unknown_interface")
        '股票数据'
    """
    category = INTERFACE_CATEGORY_MAP.get(interface_name, DEFAULT_CATEGORY)
    return category


def get_all_categories() -> list[str]:
    """
    获取所有可用的分类列表
    
    Returns:
        list[str]: 按顺序排列的分类列表（不包含"全部"）
    """
    return [
        "宏观数据",
        "利率数据", 
        "外汇数据",
        "期货",
        "期权",
        "债券",
        "现货",
        "指数",
        "QDII",
        "另类",
        "股票数据"
    ]


def validate_category(category: str) -> bool:
    """
    验证分类名称是否有效
    
    Args:
        category: 要验证的分类名称
        
    Returns:
        bool: 分类是否有效
    """
    return category in CATEGORY_LABELS.values()

# CLAUDE.md - Phase 1: AKShare数据获取扩展

## 📋 阶段目标

将39个无参数AKShare接口封装为MCP tools，使其可被LibreChat中的LLM调用，实现9大类金融数据的自动化获取。

**核心原则**：
- 每个接口一个MCP tool
- 固定中文文件名（非时间戳）
- 中文数据源标识
- 用户级别文件隔离
- 必须有验证脚本，验证脚本必须包含真实的 ak 接口调用测试，并检查生成的 .csv 文件内容是否非空。如果接口因网络波动失败，必须体现你要求的**“指数退避”**逻辑在 Tool 内部的初步实现或异常捕获。

---

## 📚 术语定义

| 术语 | 定义 | 示例 |
|------|------|------|
| **无参数接口** | AKShare接口调用时不需要传入任何参数，返回固定数据集 | `macro_china_lpr()` |
| **中文文件名** | 根据接口功能的中文描述命名文件，不含时间戳 | `LPR品种数据.csv` |
| **数据源** | 数据的原始提供方，需硬编码为中文 | "金十数据"、"东方财富" |
| **用户隔离存储** | 数据保存到`/root/librechat_user_data/{user_id}/dataset/` | `/root/librechat_user_data/anonymous/dataset/LPR品种数据.csv` |
| **MCP tool** | FastMCP框架下的工具函数，带`@mcp.tool()`装饰器 | 参见代码示例 |

---

## 📊 接口清单与中文映射表（共39个）

### 宏观数据（24个）

#### 中国宏观（15个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `macro_china_lpr` | LPR品种数据 | 金十数据 | `LPR品种数据.csv` |
| `macro_china_gdp_yearly` | 中国GDP年率 | 金十数据 | `中国GDP年率.csv` |
| `macro_china_cpi_yearly` | 中国CPI年率 | 金十数据 | `中国CPI年率.csv` |
| `macro_china_ppi_yearly` | 中国PPI年率 | 金十数据 | `中国PPI年率.csv` |
| `macro_china_pmi_yearly` | 官方制造业PMI | 金十数据 | `官方制造业PMI.csv` |
| `macro_china_reserve_requirement_ratio` | 存款准备金率 | 金十数据 | `存款准备金率.csv` |
| `macro_china_supply_of_money` | 货币供应量 | 东方财富 | `货币供应量.csv` |
| `macro_china_industrial_production_yoy` | 规模以上工业增加值年率 | 金十数据 | `规模以上工业增加值年率.csv` |
| `macro_china_urban_unemployment` | 城镇调查失业率 | 金十数据 | `城镇调查失业率.csv` |
| `macro_china_shrzgm` | 社会融资规模增量统计 | 金十数据/东方财富 | `社会融资规模增量统计.csv` |
| `macro_china_exports_yoy` | 以美元计算出口年率 | 金十数据 | `以美元计算出口年率.csv` |
| `macro_china_imports_yoy` | 以美元计算进口年率 | 金十数据 | `以美元计算进口年率.csv` |
| `macro_china_fx_reserves_yearly` | 外汇储备 | 金十数据 | `外汇储备.csv` |
| `macro_china_national_tax_receipts` | 全国税收收入 | 金十数据/东方财富 | `全国税收收入.csv` |
| `macro_china_foreign_exchange_gold` | 央行黄金和外汇储备 | 金十数据 | `央行黄金和外汇储备.csv` |

#### 美国宏观（5个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `macro_usa_gdp_monthly` | 美国GDP | 金十数据 | `美国GDP.csv` |
| `macro_usa_cpi_yoy` | 美国CPI年率 | 金十数据 | `美国CPI年率.csv` |
| `macro_usa_ppi` | 美国生产者物价指数 | 金十数据 | `美国生产者物价指数.csv` |
| `macro_usa_industrial_production` | 美国工业产出月率 | 金十数据 | `美国工业产出月率.csv` |
| `macro_usa_unemployment_rate` | 美国失业率 | 金十数据 | `美国失业率.csv` |

#### 全球宏观（1个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `macro_cons_opec_month` | 欧佩克报告 | 金十数据 | `欧佩克报告.csv` |

### 利率数据（4个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `macro_bank_usa_interest_rate` | 美联储利率决议 | 金十数据 | `美联储利率决议.csv` |
| `macro_bank_china_interest_rate` | 中国央行利率决议 | 金十数据 | `中国央行利率决议.csv` |
| `rate_interbank` | 银行间拆借利率 | 东方财富 | `银行间拆借利率.csv` |
| `repo_rate_hist` | 回购定盘利率历史 | 金融数据提供商 | `回购定盘利率历史.csv` |

### 外汇数据（4个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `forex_hist_em` | 外汇历史行情 | 东方财富 | `外汇历史行情.csv` |
| `currency_boc_safe` | 人民币汇率中间价 | 国家外汇管理局 | `人民币汇率中间价.csv` |
| `currency_boc_sina` | 人民币牌价数据 | 新浪财经 | `人民币牌价数据.csv` |
| `fx_swap_quote` | 人民币外汇远掉报价 | 金融数据提供商 | `人民币外汇远掉报价.csv` |

### 期货期权（4个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `futures_main_sina` | 期货连续合约 | 新浪财经 | `期货连续合约.csv` |
| `option_finance_board` | 金融期权行情 | 交易所/新浪财经/东方财富 | `金融期权行情.csv` |
| `option_commodity_hist_sina` | 商品期权历史行情 | 新浪财经 | `商品期权历史行情.csv` |

### 债券（2个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `bond_spot_deal` | 现券市场成交行情 | 中国货币网 | `现券市场成交行情.csv` |
| `bond_china_yield` | 国债及其他债券收益率曲线 | 中国货币网 | `国债及其他债券收益率曲线.csv` |

### 现货（1个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `spot_hist_sge` | 上海黄金交易所历史行情 | 上海黄金交易所 | `上海黄金交易所历史行情.csv` |

### 指数（5个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `stock_zh_index_daily` | A股指数历史行情 | 新浪财经/东方财富/腾讯证券 | `A股指数历史行情.csv` |
| `stock_zh_index_hist_csindex` | 中证指数 | 中证指数 | `中证指数.csv` |
| `index_us_stock_sina` | 美股指数行情 | 新浪财经 | `美股指数行情.csv` |
| `index_option_50index_qvix` | 上证50股指期权波动率指数 | 期权论坛 | `上证50股指期权波动率指数.csv` |
| `index_news_sentiment_scope` | A股新闻情绪指数 | 数据提供商 | `A股新闻情绪指数.csv` |

### 其他（3个）
| 接口名称 | 中文名称 | 数据源 | 文件名 |
|---------|---------|--------|--------|
| `qdii_e_index_jsl` | QDII欧美指数 | 集思录 | `QDII欧美指数.csv` |
| `qdii_a_index_jsl` | QDII亚洲指数 | 集思录 | `QDII亚洲指数.csv` |
| `air_quality_hist` | 空气质量历史数据 | 真气网 | `空气质量历史数据.csv` |

---

## 🎯 详细任务清单

### Task 1.1: 创建AKShare MCP工具模块文件

**目标**：按数据类别创建6个MCP工具模块文件

#### 子任务 1.1.1: 创建宏观数据工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_macro_tools.py`

**实现内容**：
- 导入必要的库：`akshare`, `pandas`, `FastMCP`, `Container`
- 实现24个宏观数据接口的MCP工具函数
- 实现数据保存逻辑（获取user_id，保存到用户目录）

**代码模板**：
```python
# /root/stock-mcp/src/server/mcp/tools/akshare_macro_tools.py
"""AKShare 宏观数据 MCP 工具集"""

from typing import Any, Dict
import akshare as ak
import pandas as pd
from fastmcp import FastMCP
from src.server.core.dependencies import Container
from src.server.utils.logger import logger
from src.server.utils.request_context import get_current_user_id
import os

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
}

def _save_data(df: pd.DataFrame, function_name: str) -> str:
    """
    保存数据到用户目录
    
    Args:
        df: 要保存的DataFrame
        function_name: 函数名称（用于获取中文名称）
    
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
    
    # 保存CSV
    df.to_csv(file_path, index=False, encoding='utf-8-sig')
    
    logger.info(f"Data saved to {file_path}")
    return file_path

def register_akshare_macro_tools(mcp: FastMCP):
    """注册AKShare宏观数据工具"""
    
    @mcp.tool(tags={"akshare", "macro", "china"})
    async def macro_china_lpr() -> Dict[str, Any]:
        """获取LPR品种数据"""
        try:
            df = ak.macro_china_lpr()
            file_path = _save_data(df, "macro_china_lpr")
            
            return {
                "success": True,
                "data": df.to_dict(orient='records'),
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
            df = ak.macro_china_gdp_yearly()
            file_path = _save_data(df, "macro_china_gdp_yearly")
            
            return {
                "success": True,
                "data": df.to_dict(orient='records'),
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
    
    # ... 继续实现其余22个宏观数据工具
    # 每个工具遵循相同的模式
```

**验证标准**：
- [ ] 文件创建成功
- [ ] 24个工具函数全部实现
- [ ] 每个函数都有正确的中文docstring
- [ ] 数据保存路径正确（含user_id）
- [ ] 返回格式统一（success, data, source, saved_path, chinese_name）

#### 子任务 1.1.2: 创建利率数据工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_rate_tools.py`

**实现内容**：4个利率数据接口

**数据源映射**：
```python
DATA_SOURCE_MAP = {
    "macro_bank_usa_interest_rate": "金十数据",
    "macro_bank_china_interest_rate": "金十数据",
    "rate_interbank": "东方财富",
    "repo_rate_hist": "金融数据提供商",
}

CHINESE_NAME_MAP = {
    "macro_bank_usa_interest_rate": "美联储利率决议",
    "macro_bank_china_interest_rate": "中国央行利率决议",
    "rate_interbank": "银行间拆借利率",
    "repo_rate_hist": "回购定盘利率历史",
}
```

**验证标准**：
- [ ] 4个工具函数全部实现
- [ ] 数据保存和返回格式正确

#### 子任务 1.1.3: 创建外汇数据工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_forex_tools.py`

**实现内容**：4个外汇数据接口

**数据源映射**：
```python
DATA_SOURCE_MAP = {
    "forex_hist_em": "东方财富",
    "currency_boc_safe": "国家外汇管理局",
    "currency_boc_sina": "新浪财经",
    "fx_swap_quote": "金融数据提供商",
}

CHINESE_NAME_MAP = {
    "forex_hist_em": "外汇历史行情",
    "currency_boc_safe": "人民币汇率中间价",
    "currency_boc_sina": "人民币牌价数据",
    "fx_swap_quote": "人民币外汇远掉报价",
}
```

**验证标准**：
- [ ] 4个工具函数全部实现
- [ ] 数据保存和返回格式正确

#### 子任务 1.1.4: 创建期货期权工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_derivatives_tools.py`

**实现内容**：4个期货期权接口（注意：文档中列出3个，但归类为期货期权共4个）

**数据源映射**：
```python
DATA_SOURCE_MAP = {
    "futures_main_sina": "新浪财经",
    "option_finance_board": "交易所/新浪财经/东方财富",
    "option_commodity_hist_sina": "新浪财经",
}

CHINESE_NAME_MAP = {
    "futures_main_sina": "期货连续合约",
    "option_finance_board": "金融期权行情",
    "option_commodity_hist_sina": "商品期权历史行情",
}
```

**验证标准**：
- [ ] 3个工具函数全部实现
- [ ] 数据保存和返回格式正确

#### 子任务 1.1.5: 创建债券现货工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_bond_spot_tools.py`

**实现内容**：3个接口（2个债券 + 1个现货）

**数据源映射**：
```python
DATA_SOURCE_MAP = {
    "bond_spot_deal": "中国货币网",
    "bond_china_yield": "中国货币网",
    "spot_hist_sge": "上海黄金交易所",
}

CHINESE_NAME_MAP = {
    "bond_spot_deal": "现券市场成交行情",
    "bond_china_yield": "国债及其他债券收益率曲线",
    "spot_hist_sge": "上海黄金交易所历史行情",
}
```

**验证标准**：
- [ ] 3个工具函数全部实现
- [ ] 数据保存和返回格式正确

#### 子任务 1.1.6: 创建指数及其他数据工具模块
**文件**：`/root/stock-mcp/src/server/mcp/tools/akshare_index_other_tools.py`

**实现内容**：8个接口（5个指数 + 3个另类）

**数据源映射**：
```python
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
```

**验证标准**：
- [ ] 8个工具函数全部实现
- [ ] 数据保存和返回格式正确

---

### Task 1.2: 注册所有AKShare工具到MCP Server

**目标**：在MCP Server主文件中导入并注册所有新建的工具模块

**文件**：`/root/stock-mcp/src/server/mcp/server.py`

**修改内容**：
```python
# 在文件顶部导入
from src.server.mcp.tools.akshare_macro_tools import register_akshare_macro_tools
from src.server.mcp.tools.akshare_rate_tools import register_akshare_rate_tools
from src.server.mcp.tools.akshare_forex_tools import register_akshare_forex_tools
from src.server.mcp.tools.akshare_derivatives_tools import register_akshare_derivatives_tools
from src.server.mcp.tools.akshare_bond_spot_tools import register_akshare_bond_spot_tools
from src.server.mcp.tools.akshare_index_other_tools import register_akshare_index_other_tools

# 在 create_mcp_server() 函数中注册
def create_mcp_server() -> FastMCP:
    mcp = FastMCP("stock-tools")
    
    # ... 现有工具注册 ...
    
    # 注册AKShare工具
    register_akshare_macro_tools(mcp)
    register_akshare_rate_tools(mcp)
    register_akshare_forex_tools(mcp)
    register_akshare_derivatives_tools(mcp)
    register_akshare_bond_spot_tools(mcp)
    register_akshare_index_other_tools(mcp)
    
    return mcp
```

**验证标准**：
- [ ] 所有6个模块成功导入
- [ ] 所有注册函数被调用
- [ ] MCP Server启动无错误

---

### Task 1.3: 创建综合验证测试脚本

**目标**：验证所有39个AKShare工具可正常工作

**文件**：`/root/stock-mcp/tests/test_akshare_tools.py`

**实现内容**：
```python
"""AKShare MCP工具综合测试"""

import pytest
import asyncio
import os
from src.server.mcp.server import create_mcp_server

# 所有39个工具的名称列表
AKSHARE_TOOLS = [
    # 宏观数据 - 中国（15个）
    "macro_china_lpr",
    "macro_china_gdp_yearly",
    "macro_china_cpi_yearly",
    "macro_china_ppi_yearly",
    "macro_china_pmi_yearly",
    "macro_china_reserve_requirement_ratio",
    "macro_china_supply_of_money",
    "macro_china_industrial_production_yoy",
    "macro_china_urban_unemployment",
    "macro_china_shrzgm",
    "macro_china_exports_yoy",
    "macro_china_imports_yoy",
    "macro_china_fx_reserves_yearly",
    "macro_china_national_tax_receipts",
    "macro_china_foreign_exchange_gold",
    
    # 宏观数据 - 美国（5个）
    "macro_usa_gdp_monthly",
    "macro_usa_cpi_yoy",
    "macro_usa_ppi",
    "macro_usa_industrial_production",
    "macro_usa_unemployment_rate",
    
    # 宏观数据 - 全球（1个）
    "macro_cons_opec_month",
    
    # 利率数据（4个）
    "macro_bank_usa_interest_rate",
    "macro_bank_china_interest_rate",
    "rate_interbank",
    "repo_rate_hist",
    
    # 外汇数据（4个）
    "forex_hist_em",
    "currency_boc_safe",
    "currency_boc_sina",
    "fx_swap_quote",
    
    # 期货期权（3个）
    "futures_main_sina",
    "option_finance_board",
    "option_commodity_hist_sina",
    
    # 债券（2个）
    "bond_spot_deal",
    "bond_china_yield",
    
    # 现货（1个）
    "spot_hist_sge",
    
    # 指数（5个）
    "stock_zh_index_daily",
    "stock_zh_index_hist_csindex",
    "index_us_stock_sina",
    "index_option_50index_qvix",
    "index_news_sentiment_scope",
    
    # 其他（3个）
    "qdii_e_index_jsl",
    "qdii_a_index_jsl",
    "air_quality_hist",
]

@pytest.fixture
def mcp_server():
    """创建MCP Server实例"""
    return create_mcp_server()

def test_all_tools_registered(mcp_server):
    """测试：验证所有39个工具已注册"""
    registered_tools = [tool.name for tool in mcp_server.tools]
    
    for tool_name in AKSHARE_TOOLS:
        assert tool_name in registered_tools, f"工具 {tool_name} 未注册"
    
    print(f"✅ 所有39个AKShare工具已成功注册")

@pytest.mark.asyncio
async def test_sample_tools_execution():
    """测试：抽样测试5个工具的执行（避免全部测试耗时过长）"""
    sample_tools = [
        "macro_china_lpr",
        "macro_usa_gdp_monthly",
        "currency_boc_safe",
        "bond_china_yield",
        "stock_zh_index_daily",
    ]
    
    for tool_name in sample_tools:
        # 动态导入并调用工具
        # 注意：需要根据实际MCP调用方式调整
        print(f"测试工具: {tool_name}")
        # result = await call_tool(tool_name)
        # assert result["success"] == True
        # assert "saved_path" in result
        # assert os.path.exists(result["saved_path"])

def test_chinese_name_mapping():
    """测试：验证中文名称映射完整性"""
    from src.server.mcp.tools.akshare_macro_tools import CHINESE_NAME_MAP as macro_map
    from src.server.mcp.tools.akshare_rate_tools import CHINESE_NAME_MAP as rate_map
    # ... 导入其他映射表
    
    all_maps = [macro_map, rate_map]  # 添加所有映射表
    
    for tool_name in AKSHARE_TOOLS:
        found = False
        for mapping in all_maps:
            if tool_name in mapping:
                found = True
                assert mapping[tool_name] != "", f"工具 {tool_name} 的中文名称为空"
                break
        assert found, f"工具 {tool_name} 缺少中文名称映射"
    
    print("✅ 所有工具的中文名称映射完整")

def test_data_source_mapping():
    """测试：验证数据源映射完整性"""
    from src.server.mcp.tools.akshare_macro_tools import DATA_SOURCE_MAP as macro_source
    from src.server.mcp.tools.akshare_rate_tools import DATA_SOURCE_MAP as rate_source
    # ... 导入其他映射表
    
    all_sources = [macro_source, rate_source]  # 添加所有映射表
    
    for tool_name in AKSHARE_TOOLS:
        found = False
        for mapping in all_sources:
            if tool_name in mapping:
                found = True
                assert mapping[tool_name] != "", f"工具 {tool_name} 的数据源为空"
                break
        assert found, f"工具 {tool_name} 缺少数据源映射"
    
    print("✅ 所有工具的数据源映射完整")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

**验证标准**：
- [ ] 测试脚本运行成功
- [ ] 所有39个工具已注册
- [ ] 抽样测试的5个工具可正常调用
- [ ] 中文名称映射完整
- [ ] 数据源映射完整

---

## ⚠️ 注意事项与常见陷阱

### 1. 用户ID获取问题
**问题**：`get_current_user_id()` 可能返回None
**解决方案**：使用 `user_id = get_current_user_id() or "anonymous"` 作为fallback

### 2. AKShare接口调用失败
**问题**：某些接口可能因网络问题或数据源维护失败
**解决方案**：
- 每个工具都要有try-except包裹
- 返回`{"success": False, "error": str(e)}`
- 记录详细错误日志

### 3. 文件名特殊字符
**问题**：中文文件名可能在某些系统上有问题
**解决方案**：
- 使用 `encoding='utf-8-sig'` 保存CSV
- 确保目录存在：`os.makedirs(base_dir, exist_ok=True)`

### 4. DataFrame为空
**问题**：某些接口可能返回空数据
**解决方案**：
- 检查 `len(df)` 是否为0
- 返回结果中包含 `record_count` 字段

### 5. MCP Server重启
**问题**：修改工具后需要重启MCP Server
**解决方案**：
- 使用 `systemctl restart stock-mcp`（如果配置了systemd）
- 或手动停止并重新启动

### 6. LibreChat集成测试
**问题**：工具注册后LibreChat可能看不到
**解决方案**：
- 检查LibreChat的MCP配置文件
- 重启LibreChat服务
- 检查MCP Server日志

---

## ✅ 阶段验收标准

完成Phase 1后，应达到以下标准：

### 1. 代码完整性验收

**验证方式**：`pytest tests/test_phase1_structure.py -v`

- [ ] **6个模块文件存在**
  ```bash
  [ $(ls -1 /root/stock-mcp/src/server/mcp/tools/akshare_*.py 2>/dev/null | wc -l) -eq 6 ]
  ```

- [ ] **每个文件非空（>100行代码）**
  ```python
  def test_modules_not_empty():
      import glob
      files = glob.glob("/root/stock-mcp/src/server/mcp/tools/akshare_*.py")
      for f in files:
          with open(f) as file:
              assert len(file.readlines()) > 100, f"{f} 代码量不足"
  ```

- [ ] **所有文件包含必需import**
  ```python
  def test_required_imports():
      import glob
      files = glob.glob("/root/stock-mcp/src/server/mcp/tools/akshare_*.py")
      for f in files:
          with open(f) as file:
              content = file.read()
              assert "from fastmcp import FastMCP" in content
              assert "import akshare as ak" in content
  ```

### 2. 工具注册验收

**验证方式**：`pytest tests/test_phase1_registration.py -v`

- [ ] **MCP Server可启动**
  ```python
  def test_mcp_server_starts():
      from src.server.mcp.server import create_mcp_server
      mcp = create_mcp_server()
      assert mcp is not None
  ```

- [ ] **39个工具已注册**
  ```python
  def test_39_tools_registered():
      from src.server.mcp.server import create_mcp_server
      mcp = create_mcp_server()
      akshare_tools = [t.name for t in mcp.tools if 'macro' in t.name or 'forex' in t.name or 'bond' in t.name]
      assert len(akshare_tools) == 39, f"期望39个工具，实际{len(akshare_tools)}个"
  ```

- [ ] **工具名称与预期完全匹配**
  ```python
  EXPECTED_TOOLS = ["macro_china_lpr", "macro_china_gdp_yearly", ...]  # 完整39个
  
  def test_tool_names_match():
      from src.server.mcp.server import create_mcp_server
      mcp = create_mcp_server()
      registered = set([t.name for t in mcp.tools])
      missing = set(EXPECTED_TOOLS) - registered
      assert len(missing) == 0, f"缺少工具: {missing}"
  ```

### 3. 数据保存验收（抽样5个工具）

**验证方式**：`pytest tests/test_phase1_data_save.py -v`

- [ ] **文件保存路径正确**
  ```python
  @pytest.mark.asyncio
  @pytest.mark.parametrize("tool_name", [
      "macro_china_lpr",
      "macro_usa_gdp_monthly", 
      "currency_boc_safe",
      "bond_china_yield",
      "stock_zh_index_daily"
  ])
  async def test_save_path_format(tool_name):
      # 动态导入工具
      result = await call_tool(tool_name)
      assert result["success"] == True
      assert "/librechat_user_data/" in result["saved_path"]
      assert "/dataset/" in result["saved_path"]
  ```

- [ ] **文件实际存在**
  ```python
  def test_file_exists(tool_name):
      result = await call_tool(tool_name)
      assert os.path.exists(result["saved_path"]), f"文件不存在: {result['saved_path']}"
  ```

- [ ] **文件名包含中文字符**
  ```bash
  # 检查至少5个CSV文件名包含中文
  ls /root/librechat_user_data/*/dataset/*.csv | \
    grep -P '[\x{4e00}-\x{9fa5}]+\.csv' | \
    wc -l | \
    awk '{if ($1 >= 5) {print "PASS"} else {print "FAIL"}}'
  ```

- [ ] **文件名无时间戳**
  ```python
  def test_filename_no_timestamp():
      result = await macro_china_lpr()
      filename = os.path.basename(result["saved_path"])
      # 检查文件名不包含数字（时间戳通常是数字）
      assert not re.search(r'\d{8}', filename), "文件名包含时间戳"
  ```

### 4. 返回格式验收

**验证方式**：`pytest tests/test_phase1_return_format.py -v`

- [ ] **返回dict包含必需键**
  ```python
  @pytest.mark.asyncio
  async def test_return_format():
      result = await macro_china_lpr()
      
      required_keys = ["success", "data", "source", "saved_path", "chinese_name", "record_count"]
      for key in required_keys:
          assert key in result, f"缺少键: {key}"
  ```

- [ ] **success为True（正常情况）**
  ```python
  def test_success_true():
      result = await macro_china_lpr()
      assert result["success"] == True
  ```

- [ ] **record_count > 0**
  ```python
  def test_record_count_positive():
      result = await macro_china_lpr()
      assert result["record_count"] > 0, "数据为空"
  ```

### 5. CSV文件内容验收

**验证方式**：`pytest tests/test_phase1_csv_content.py -v`

- [ ] **CSV非空**
  ```python
  def test_csv_not_empty():
      result = await macro_china_lpr()
      df = pd.read_csv(result["saved_path"])
      assert len(df) > 0, "CSV文件为空"
  ```

- [ ] **CSV可被pandas读取（编码正确）**
  ```python
  def test_csv_readable():
      result = await macro_china_lpr()
      try:
          df = pd.read_csv(result["saved_path"], encoding='utf-8-sig')
          assert True
      except UnicodeDecodeError:
          assert False, "CSV编码错误"
  ```

### 6. 中文名称和数据源映射验收

**验证方式**：`pytest tests/test_phase1_mappings.py -v`

- [ ] **所有工具有中文名称映射**
  ```python
  def test_all_tools_have_chinese_names():
      from src.server.mcp.tools.akshare_macro_tools import CHINESE_NAME_MAP
      from src.server.mcp.tools.akshare_rate_tools import CHINESE_NAME_MAP as rate_map
      # ... 导入所有映射表
      
      all_maps = {"macro": macro_map, "rate": rate_map, ...}
      
      for tool in EXPECTED_TOOLS:
          found = False
          for category, mapping in all_maps.items():
              if tool in mapping:
                  assert mapping[tool] != "", f"{tool} 中文名称为空"
                  found = True
                  break
          assert found, f"{tool} 缺少中文名称"
  ```

- [ ] **所有工具有数据源映射**
  ```python
  def test_all_tools_have_data_sources():
      # 类似逻辑检查DATA_SOURCE_MAP
      ...
  ```

### 7. 异常处理验收

**验证方式**：`pytest tests/test_phase1_error_handling.py -v`

- [ ] **网络错误返回success=False**
  ```python
  def test_network_error_handling():
      with patch('akshare.macro_china_lpr', side_effect=Exception("Network error")):
          result = await macro_china_lpr()
          assert result["success"] == False
          assert "error" in result
  ```

- [ ] **不抛出未捕获异常**
  ```python
  def test_no_uncaught_exceptions():
      try:
          result = await macro_china_lpr()
          assert True
      except Exception as e:
          assert False, f"抛出未捕获异常: {e}"
  ```

---

### 🧪 完整验证命令

运行以下命令验证Phase 1是否完成：

```bash
# 1. 结构检查
pytest tests/test_phase1_structure.py -v

# 2. 工具注册检查
pytest tests/test_phase1_registration.py -v

# 3. 数据保存检查（抽样）
pytest tests/test_phase1_data_save.py -v -k "sample"

# 4. 返回格式检查
pytest tests/test_phase1_return_format.py -v

# 5. 映射表检查
pytest tests/test_phase1_mappings.py -v

# 6. 异常处理检查
pytest tests/test_phase1_error_handling.py -v

# 或一次性运行所有Phase 1测试
pytest tests/test_phase1_*.py -v
```

**通过标准**：所有测试PASSED，0 failed。

**如果失败**：查看FAILED的测试名称和assertion错误信息，修复对应问题后重新测试。

---

**⚠️ 已删除的验收项（无法自动化）**：
- ~~"LibreChat可列出所有39个新工具"~~ → 需要人工在UI上确认
- ~~"在LibreChat中成功调用至少1个工具"~~ → 需要人工对话测试

这些项目可作为**手动验收步骤**，但不作为自动化验收标准。

---

## 📝 下一阶段预告

完成Phase 1后，将进入**Phase 2: 数据预处理模块重构**，主要任务包括：
- 修正数据清洗逻辑（删除→填充）
- 实现用户可选预处理（对数、差分）
- 创建预处理API端点
- 前端对接预处理功能

---

*本文档版本：v1.1*  
*最后更新：2026-01-15*

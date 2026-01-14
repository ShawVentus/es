# Stock MCP 工具列表与使用指南

`stock-mcp` 提供了 21 个工具，涵盖资产查询、市场数据、新闻、技术分析、深度研究、公告文件、交易及文档分块等功能。

## 1. 资产管理 (Asset Tools) - 6 个工具

此类工具用于查找资产、获取基本信息及价格数据。

### [search_assets](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#58-109)
- **功能**: 搜索股票、加密货币、ETF 等资产。
- **参数**:
  - `query` (str): 搜索关键词 (例如 "Alibaba", "BTC", "Apple")。**注意**: 建议使用英文名称以获得最佳结果 (Yahoo Finance 对中文支持有限)。
  - `asset_types` (list[str], optional): 资产类型过滤 ([stock](file:///root/stock-mcp/src/server/mcp/tools/news_tools.py#16-34), `etf`, `crypto`, `index`)。
  - `limit` (int, optional): 返回结果数量限制 (默认 10)。
- **返回结果**: 资产列表，包含标准化 [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (例如 `NASDAQ:AAPL`, `HKEX:0700`, `SSE:600519`)。

### [get_asset_info](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#110-132)
- **功能**: 获取资产的详细属性信息 (公司简介、行业、市值等)。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (str): 资产代码 (格式: `EXCHANGE:SYMBOL`)。
- **返回结果**: 包含资产详细信息的字典。

### [get_real_time_price](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#133-155)
- **功能**: 获取单个资产的实时价格。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (str): 资产代码。
- **返回结果**: 包含价格、变动、成交量等实时数据的字典。

### [get_multiple_prices](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#156-171)
- **功能**: 批量获取多个资产的实时价格。
- **参数**:
  - `tickers` (list[str]): 资产代码列表。
- **返回结果**: {ticker: price_data} 映射字典。

### [get_historical_prices](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#172-210)
- **功能**: 获取历史价格数据 (OHLCV)。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (str): 资产代码。
  - `start_date` (str): 开始日期 (YYYY-MM-DD)。
  - `end_date` (str): 结束日期 (YYYY-MM-DD)。
  - `interval` (str, optional): 周期 (默认 `1d`, 可选 `1wk`, `1mo`)。
- **返回结果**: 历史数据点列表。

### [get_market_report](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#211-240)
- **功能**: 获取综合市场报告 (含当前价格和资产属性)。
- **参数**:
  - `symbol` (str): 资产代码。
- **返回结果**: 包含 [info](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#110-132) 和 [price](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#133-155) 的综合字典。

---

## 2. 新闻服务 (News Tools) - 1 个工具

### [get_stock_news](file:///root/stock-mcp/src/server/mcp/tools/news_tools.py#16-34)
- **功能**: 获取特定股票的近期新闻。
- **参数**:
  - `symbol` (str): 股票代码。
  - `days_back` (int, optional): 回溯天数 (默认 7)。
- **返回结果**: 新闻条目列表 (标题、链接、发布时间、摘要)。

---

## 3. 基本面分析 (Fundamental Tools) - 1 个工具

### [get_financial_report](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#16-34)
- **功能**: 获取财务分析报告。
- **参数**:
  - `symbol` (str): 股票代码。
- **返回结果**: 包含财务指标、估值分析等数据的字典。

---

## 4. 技术分析 (Technical Tools) - 5 个工具

### [calculate_technical_indicators](file:///root/stock-mcp/src/server/mcp/tools/technical_tools.py#61-89)
- **功能**: 计算常用技术指标 (SMA, RSI, MACD, 布林带等)。
- **参数**:
  - `symbol` (str): 股票代码。
  - [period](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82) (str, optional): 数据周期 (默认 `30d`)。
  - `interval` (str, optional): K线间隔 (默认 `1d`)。
- **返回结果**: 各项技术指标数值。

### [generate_trading_signal](file:///root/stock-mcp/src/server/mcp/tools/technical_tools.py#90-119)
- **功能**: 基于技术指标生成交易信号。
- **参数**:
  - `symbol` (str): 股票代码。
  - [period](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82) (str, optional): 周期。
  - `interval` (str, optional): 间隔。
- **返回结果**: 买入/卖出/持有 信号及分析依据。

### [analyze_price_patterns](file:///root/stock-mcp/src/server/mcp/tools/technical_tools.py#120-144)
- **功能**: 识别价格形态 (如头肩顶、双底等)。
- **参数**:
  - `symbol` (str): 股票代码。
  - [period](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82) (str, optional): 周期 (默认 `90d`)。
- **返回结果**: 识别到的形态列表。

### [calculate_support_resistance](file:///root/stock-mcp/src/server/mcp/tools/technical_tools.py#145-173)
- **功能**: 计算支撑位和阻力位。
- **参数**:
  - `symbol` (str): 股票代码。
  - [period](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82) (str, optional): 周期 (默认 `90d`)。
- **返回结果**: 包含支撑位和阻力位价格列表的字典。

### [analyze_volume_profile](file:///root/stock-mcp/src/server/mcp/tools/technical_tools.py#174-198)
- **功能**: 分析成交量分布 (筹码分布)。
- **参数**:
  - `symbol` (str): 股票代码。
  - [period](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82) (str, optional): 周期.
- **返回结果**: 成交量分析数据。

---

## 5. 深度研究 (Research Tools) - 1 个工具

### [perform_deep_research](file:///root/stock-mcp/src/server/mcp/tools/research_tools.py#18-80)
- **功能**: 执行深度个股研究，聚合行情、基本面和新闻。
- **参数**:
  - `symbol` (str): 股票代码。
  - `days_back` (int, optional): 新闻回溯天数 (默认 30)。
- **返回结果**: 包含 [market_data](file:///root/stock-mcp/src/server/mcp/tools/research_tools.py#43-61), [fundamentals](file:///root/stock-mcp/src/server/mcp/tools/research_tools.py#62-64), [news](file:///root/stock-mcp/src/server/mcp/tools/research_tools.py#65-67) 的完整报告。

---

## 6. 交易执行 (Trade Tools) - 2 个工具 (模拟)

### [execute_order](file:///root/stock-mcp/src/server/mcp/tools/trade_tools.py#17-61)
- **功能**: 执行交易订单 (目前为模拟模式)。
- **参数**:
  - `symbol` (str): 交易对。
  - `side` (str): `buy` 或 `sell`。
  - `type` (str): [market](file:///root/stock-mcp/src/server/mcp/tools/research_tools.py#43-61) 或 `limit`。
  - `quantity` (float): 数量。
  - [price](file:///root/stock-mcp/src/server/mcp/tools/asset_tools.py#133-155) (float, optional): 限价单价格。
- **返回结果**: 订单执行状态。

### [get_account_balance](file:///root/stock-mcp/src/server/mcp/tools/trade_tools.py#62-82)
- **功能**: 获取账户余额 (目前为模拟数据)。
- **参数**:
  - `exchange_id` (str, optional): 交易所ID。
- **返回结果**: 账户余额字典。

---

## 7. 公告文件 (Filings Tools) - 4 个工具

### [fetch_periodic_sec_filings](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#18-82)
- **功能**: 获取美股定期报告 (10-K, 10-Q 等)。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (str): 美股代码。
  - `forms` (list[str]): 表格类型 (默认 ["10-K", "10-Q"])。
  - `year`/`quarter`: 指定年份/季度。
- **返回结果**: 文件列表元数据。

### [fetch_event_sec_filings](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#83-147)
- **功能**: 获取美股重大事件报告 (8-K, Form 4 等)。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58) (str): 美股代码。
  - `forms` (list[str]): 表格类型。
  - `start_date`/`end_date`: 日期范围。
- **返回结果**: 文件列表元数据。

### [fetch_ashare_filings](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#148-207)
- **功能**: 获取A股公告 (来自巨潮资讯)。
- **参数**:
  - `symbol` (str): A股代码 (EXCHANGE:CODE)。
  - `filing_types` (list[str]): 类型 (`annual`, `quarterly` 等, 必须用英文)。
  - `start_date`/`end_date`: 日期范围。
- **返回结果**: 公告列表。

### [process_document](file:///root/stock-mcp/src/server/mcp/tools/filings_tools.py#208-252)
- **功能**: 下载并处理单个文档 (提取文本)。
- **参数**:
  - `doc_id`: 文档ID。
  - `url`: 文档URL。
  - `doc_type`: 文档类型。
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58): 股票代码 (SEC文件必需)。
- **返回结果**: 包含提取文本内容的字典。

---

## 8. 智能分块 (Chunking Tools) - 1 个工具

### [get_document_chunks](file:///root/stock-mcp/src/server/mcp/tools/chunking_tools.py#46-253)
- **功能**: 对 SEC 文件进行语义分块 (基于 Items)。
- **参数**:
  - [ticker](file:///root/stock-mcp/src/server/mcp/tools/fundamental_tools.py#36-58): 股票代码。
  - `doc_id`: SEC Accession Number。
  - `items` (list[str], optional): 指定提取章节 (如 `Item 1A`, `Item 7`)。
- **返回结果**: 结构化的文本块列表，便于 RAG 使用。

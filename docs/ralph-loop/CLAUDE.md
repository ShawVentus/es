# CLAUDE.md - EasySTAT 金融时间序列研究平台

## 项目概述

EasySTAT是一个面向计量经济学科研人员的金融时间序列研究全流程自动化平台。

**核心功能**：
1. 多源金融数据获取（39个AKShare接口）
2. 智能数据预处理（缺失值/异常值填充）
3. 统计检验（9项检验：4单变量+5多变量）
4. 时序模型构建（6种模型：ARIMA/ARMA/GARCH/ARCH/VAR/VECM）
5. 学术报告自动生成（Word格式+AI经济学分析）

---

## 执行说明

### 文档结构

本项目的执行文档分为6个Phase，**必须按顺序执行**：

| Phase | 文档 | 主要内容 |
|-------|------|---------|
| 1 | `CLAUDE_PHASE1_数据获取.md` | 39个AKShare MCP工具封装 |
| 2 | `CLAUDE_PHASE2_数据预处理.md` | 数据清洗与转换 |
| 3 | `CLAUDE_PHASE3_统计检验.md` | 9项统计检验 |
| 4 | `CLAUDE_PHASE4_模型构建.md` | 6种时序模型 |
| 5 | `CLAUDE_PHASE5_报告生成.md` | Word报告+Qwen AI分析 |
| 6 | `CLAUDE_PHASE6_集成验证.md` | 集成测试 |

### 执行顺序

1. 阅读当前Phase文档
2. 按Task编号顺序执行
3. 每个Task完成后验证
4. 通过验证后进入下一个Task
5. 所有Task完成后进入下一个Phase

### ⚠️ 验证原则

**重要**：不要仅依赖文档或代码注释判断功能是否实现。必须：
1. **实际运行代码验证**
2. **检查API端点是否可访问**
3. **检查前端页面是否正常渲染**
4. **检查数据是否正确保存**

### 📋 验证方式规范

每个Phase的验收标准**必须**通过以下方式之一进行验证：

#### ✅ 允许的验证方式

| 验证方式 | 说明 | 示例 |
|---------|------|------|
| **pytest自动化测试** | 运行测试脚本，退出码必须为0 | `pytest tests/test_phase1.py -v` |
| **命令行指令断言** | 执行命令，输出匹配预期 | `ls file.csv` 文件存在 |
| **API调用验证** | HTTP请求返回特定JSON | `curl /api/stats` 返回 `{"success": true}` |
| **代码内容检查** | grep/ack搜索特定代码 | `grep "add_constant" file.py` 返回非空 |
| **文件内容验证** | 检查文件格式、行数、编码 | `wc -l file.csv` >= 10 |

#### ❌ 禁止的验证方式（无法自动化）

- "功能正常"（无明确标准）
- "LibreChat UI显示XX"（需要人工操作）
- "代码实现正确"（需要运行测试验证）
- "效果良好"（主观判断）

#### 🧪 pytest测试脚本规范

每个Phase应创建对应的测试文件：

```python
# tests/test_phase1_structure.py
"""Phase 1: 结构验证"""

def test_modules_created():
    """验证：6个模块文件已创建"""
    import glob
    files = glob.glob("/root/stock-mcp/src/server/mcp/tools/akshare_*.py")
    assert len(files) == 6, f"期望6个文件，实际{len(files)}个"

def test_tools_registered():
    """验证：39个工具已注册"""
    from src.server.mcp.server import create_mcp_server
    mcp = create_mcp_server()
    tools = [t.name for t in mcp.tools]
    assert len(tools) >= 39, f"期望至少39个工具，实际{len(tools)}个"
```

运行方式：
```bash
pytest tests/test_phase1_structure.py -v
# 期望输出：2 passed
```

#### 📝 命令行验证示例

```bash
# 验证文件存在
test -f /root/stock-mcp/src/server/api/routes/statistics.py && echo "PASS" || echo "FAIL"

# 验证文件行数
[ $(wc -l < /root/stock-mcp/src/server/mcp/tools/akshare_macro_tools.py) -gt 100 ] && echo "PASS" || echo "FAIL"

# 验证API端点可访问
curl -s http://localhost:8000/api/statistics/univariate -X OPTIONS | grep "200 OK" && echo "PASS" || echo "FAIL"

# 验证中文文件名
ls /root/librechat_user_data/*/dataset/*.csv | grep -P '[\x{4e00}-\x{9fa5}]+\.csv' && echo "PASS" || echo "FAIL"
```

### 注意
每次运行都需要简要记录遇到的问题到/root/..issue.md中

---

## 关键文件路径

### 后端代码
```
/root/stock-mcp/src/server/
├── mcp/tools/        # MCP工具（AKShare接口）
├── api/routes/       # API路由
└── domain/services/  # 业务服务
```

### 前端代码
```
/root/frontend/src/
├── pages/            # 页面组件
└── api/              # API调用
```

### 测试代码
```
/root/test/           # 原有测试代码（可复用）
/root/stock-mcp/tests/# 新测试代码
```

### 数据存储
```
/root/librechat_user_data/{user_id}/
├── dataset/          # 原始数据
├── processed/        # 预处理数据
├── models/           # 模型结果
└── reports/          # 生成的报告
```

### 参考文档
- `/root/docs/接口.md` - AKShare接口清单
- `/root/docs/接口参数.md` - 接口参数说明
- `/root/docs/qwen_api.md` - Qwen API调用示例

---

## 核心配置

### Qwen API
```python
BASE_URL = "https://openapi.dp.tech/openapi/v1"
API_KEY = "4c97924ea86e4b40b9cf091dcfd20e44"  # 硬编码
MODEL = "qwen-plus"
```

### 模型参数范围
| 模型 | 参数范围 |
|------|---------|
| ARIMA | p,q ∈ [0,5], d ∈ [0,2] |
| GARCH | p,q ∈ [1,5] |
| 分布 | normal, t, ged |
| 脉冲响应 | 10期, Bootstrap 500次, 95%置信 |

### 数据处理规则
| 操作 | 方法 |
|------|------|
| 缺失值 | 前值填充 (ffill) |
| 异常值 | 3σ法则检测后前值填充 |
| 对数转换 | log / log1p |
| 差分 | 1阶 / 2阶 |

---

## 快速验收清单

### Phase 1: AKShare数据获取
- [ ] 39个工具注册到MCP Server
- [ ] 数据保存到 `/librechat_user_data/{user_id}/dataset/`
- [ ] 文件名为中文（如"LPR品种数据.csv"）

### Phase 2: 数据预处理
- [ ] `ffill()` 填充缺失值（非删除）
- [ ] 3σ法则检测异常值后填充
- [ ] 支持对数/差分转换

### Phase 3: 统计检验
- [ ] 4项单变量检验（ADF、JB、Ljung-Box、ARCH LM）
- [ ] 5项多变量检验（Pearson、VIF、Panel ADF、Johansen、Granger）
- [ ] 自动滞后阶数选择（AIC/BIC）

### Phase 4: 模型构建
- [ ] GARCH支持ARMA均值方程自动选择
- [ ] GARCH支持三种分布
- [ ] VAR/VECM有脉冲响应分析

### Phase 5: 报告生成
- [ ] Qwen生成经济学分析（200-500字）
- [ ] 10种学术图表生成
- [ ] Word报告可编辑

### Phase 6: 集成验证
- [ ] 所有API端点可访问
- [ ] 全流程端到端测试通过

---

## 错误处理

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `ModuleNotFoundError` | 缺少依赖 | `pip install {package}` |
| `FileNotFoundError` | 路径错误 | 检查user_id和文件名 |
| `API 500 Error` | 服务异常 | 查看stock-mcp日志 |
| `中文乱码` | 字体问题 | 安装SimHei字体 |
| `Qwen调用失败` | 网络/配额 | 触发降级模板 |

---

## 交付物清单

### 后端新增文件（预计）
- 6个AKShare工具模块
- 4个API路由文件
- 8个服务类文件

### 前端修改文件（预计）
- 4个页面组件

### 文档文件
- 1个主CLAUDE.md
- 6个Phase文档
- 1个验收报告模板

---

## ✅ 任务完成标准

### 必须全部满足以下条件才能输出 完成所有Phase并通过最终验收清单后输出:<promise>DONE</promise>

#### Phase 1 完成条件（必需）

**验证方式**：`pytest tests/test_phase1_*.py -v`

1. **文件结构验证**
   ```bash
   # 6个模块文件存在
   [ $(ls -1 /root/stock-mcp/src/server/mcp/tools/akshare_*.py 2>/dev/null | wc -l) -eq 6 ]
   ```

2. **工具注册验证**
   ```python
   # pytest测试：39个工具已注册
   def test_all_tools_registered():
       from src.server.mcp.server import create_mcp_server
       mcp = create_mcp_server()
       assert len([t for t in mcp.tools if 'macro_china' in t.name or 'macro_usa' in t.name]) >= 39
   ```

3. **数据保存验证**（抽样5个工具）
   ```python
   # pytest测试：调用工具后文件保存到正确路径
   @pytest.mark.asyncio
   async def test_data_save_path():
       result = await macro_china_lpr()
       assert result["success"] == True
       assert "/librechat_user_data/" in result["saved_path"]
       assert "/dataset/" in result["saved_path"]
       assert os.path.exists(result["saved_path"])
   ```

4. **中文文件名验证**
   ```bash
   # 检查文件名包含中文字符
   ls /root/librechat_user_data/*/dataset/*.csv | grep -P '[\x{4e00}-\x{9fa5}]+\.csv' | wc -l
   # 应 >= 5（抽样测试至少5个文件）
   ```

#### Phase 2 完成条件（必需）

**验证方式**：`pytest tests/test_phase2_*.py -v`

1. **服务类文件验证**
   ```bash
   # DataPreprocessingService类存在
   test -f /root/stock-mcp/src/server/domain/services/data_preprocessing_service.py
   ```

2. **API端点验证**
   ```bash
   # 3个端点可访问（需先启动服务）
   curl -s http://localhost:8000/api/preprocessing/clean -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/preprocessing/transform -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/preprocessing/stats -X OPTIONS | grep -q "200"
   ```

3. **ffill填充逻辑验证**
   ```python
   # pytest测试：缺失值使用ffill而非dropna
   def test_missing_value_logic():
       from src.server.domain.services.data_preprocessing_service import DataPreprocessingService
       service = DataPreprocessingService()
       
       # 检查代码中使用ffill
       import inspect
       source = inspect.getsource(service.clean_data)
       assert "ffill()" in source
       assert "dropna()" not in source or "# dropna" in source  # 允许注释
   ```

4. **异常值填充逻辑验证**
   ```python
   # pytest测试：3σ检测后填充
   def test_outlier_handling():
       service = DataPreprocessingService()
       df = pd.DataFrame({"value": [1, 2, 3, 100, 5]})  # 100是异常值
       result = service.clean_data(df, "value")
       
       # 验证异常值被填充而非删除
       assert len(result) == 5  # 行数不变
       assert result.iloc[3]["value"] != 100  # 异常值已被填充
   ```

#### Phase 3 完成条件（必需）

**验证方式**：`pytest tests/test_phase3_*.py -v`

1. **服务类文件验证**
   ```bash
   test -f /root/stock-mcp/src/server/domain/services/statistical_tests_service.py && \
   test -f /root/stock-mcp/src/server/domain/services/multivariate_tests_service.py
   ```

2. **API端点验证**
   ```bash
   curl -s http://localhost:8000/api/statistics/univariate -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/statistics/multivariate -X OPTIONS | grep -q "200"
   ```

3. **JB检验返回验证**
   ```python
   # pytest测试：JB检验正常返回
   def test_jb_test_returns():
       service = StatisticalTestsService()
       series = pd.Series(np.random.randn(100))
       result = service.jarque_bera_test(series)
       assert "test_statistic" in result
       assert "p_value" in result
       assert "is_normal" in result
   ```

4. **自动滞后阶数验证**
   ```python
   # pytest测试：Ljung-Box使用自动滞后
   def test_ljung_box_auto_lag():
       service = StatisticalTestsService()
       series = pd.Series(np.random.randn(100))
       result = service.ljung_box_auto(series)
       assert "selected_lag" in result
       assert 1 <= result["selected_lag"] <= 20
       assert "aic" in result
   ```

5. **格兰杰因果检验验证**
   ```python
   # pytest测试：格兰杰因果可两两检验
   def test_granger_causality_pairwise():
       service = MultivariateTestsService()
       df = pd.DataFrame({
           "var1": np.random.randn(100),
           "var2": np.random.randn(100),
           "var3": np.random.randn(100)
       })
       result = service.granger_causality_matrix(df)
       
       # 3个变量应有6对因果关系（3*2）
       assert len(result["causality_matrix"]) >= 6
       assert "var1->var2" in result["causality_matrix"]
       assert "var2->var1" in result["causality_matrix"]
   ```

#### Phase 4 完成条件（必需）

**验证方式**：`pytest tests/test_phase4_*.py -v`

1. **服务类文件验证**
   ```bash
   test -f /root/stock-mcp/src/server/domain/services/models/arima_service.py && \
   test -f /root/stock-mcp/src/server/domain/services/models/garch_service.py && \
   test -f /root/stock-mcp/src/server/domain/services/models/var_service.py
   ```

2. **API端点验证**
   ```bash
   # 6个模型端点可访问
   curl -s http://localhost:8000/api/models/arima -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/models/arma -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/models/garch -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/models/arch -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/models/var -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/models/vecm -X OPTIONS | grep -q "200"
   ```

3. **ARIMA搜索范围验证**
   ```python
   # pytest测试：ARIMA搜索范围正确
   def test_arima_search_range():
       # 检查代码中AutoARIMA参数
       import inspect
       from src.server.domain.services.models.arima_service import ARIMAService
       service = ARIMAService()
       source = inspect.getsource(service.fit_arima)
       
       # 验证搜索范围
       assert "max_p=5" in source or "range(0, 6)" in source
       assert "max_q=5" in source or "range(0, 6)" in source
       assert "max_d=2" in source or "range(0, 3)" in source
   ```

4. **GARCH分布支持验证**
   ```python
   # pytest测试：GARCH支持三种分布
   @pytest.mark.parametrize("dist", ["normal", "t", "ged"])
   def test_garch_distributions(dist):
       service = GARCHService()
       series = pd.Series(np.random.randn(100))
       result = service.fit_garch(series, distribution=dist)
       assert result.get("distribution") == dist
   ```

5. **GARCH均值方程验证**
   ```python
   # pytest测试：GARCH均值方程非固定常数
   def test_garch_mean_equation():
       service = GARCHService()
       series = pd.Series(np.random.randn(100))
       result = service.fit_garch(series)
       
       assert "mean_equation" in result
       mean_eq = result["mean_equation"]
       # 验证有ARMA参数（p或q至少一个>0）
       assert "p" in mean_eq or "q" in mean_eq
   ```

6. **脉冲响应验证**
   ```python
   # pytest测试：VAR有脉冲响应分析
   def test_var_impulse_response():
       service = VARService()
       df = pd.DataFrame({
           "var1": np.random.randn(100),
           "var2": np.random.randn(100)
       })
       result = service.fit_var(df, include_irf=True)
       
       assert "impulse_response" in result
       irf = result["impulse_response"]
       assert irf.get("success") == True
       assert "periods" in irf
       assert len(irf["periods"]) == 10  # 10期
       assert "confidence_intervals" in irf  # Bootstrap置信区间
   ```

#### Phase 5 完成条件（必需）

**验证方式**：`pytest tests/test_phase5_*.py -v`

1. **服务类文件验证**
   ```bash
   test -f /root/stock-mcp/src/server/domain/services/qwen_client.py && \
   test -f /root/stock-mcp/src/server/domain/services/chart_generator.py && \
   test -f /root/stock-mcp/src/server/domain/services/report_generator.py
   ```

2. **API端点验证**
   ```bash
   curl -s http://localhost:8000/api/reports/generate -X OPTIONS | grep -q "200" && \
   curl -s http://localhost:8000/api/reports/download/test.docx -X OPTIONS | grep -q "200"
   ```

3. **Qwen调用/降级验证**
   ```python
   # pytest测试：Qwen可调用或触发降级
   def test_qwen_call_or_fallback():
       from src.server.domain.services.qwen_client import QwenClient
       client = QwenClient()
       
       # Mock网络失败场景
       with patch('httpx.AsyncClient.post', side_effect=Exception("Network error")):
           result = client.generate_analysis("测试数据")
           
           # 验证降级模板触发
           assert result is not None
           assert len(result) > 0
           assert "数据分析" in result or "经济" in result
   ```

4. **图表生成验证**
   ```python
   # pytest测试：至少生成5种图表
   def test_chart_generation():
       from src.server.domain.services.chart_generator import ChartGenerator
       generator = ChartGenerator("/tmp/test_charts")
       
       # 生成测试数据
       data = np.random.randn(100)
       
       # 验证可生成5种图表
       charts = [
           generator.plot_time_series(data),
           generator.plot_acf_pacf(data),
           generator.plot_residuals(data),
           generator.plot_qq(data),
           generator.plot_fitted_vs_actual(data, data)
       ]
       
       for chart_path in charts:
           assert os.path.exists(chart_path)
           assert os.path.getsize(chart_path) > 0
   ```

5. **Word文档生成验证**
   ```python
   # pytest测试：可生成Word文档
   def test_word_generation():
       from src.server.domain.services.report_generator import ReportGenerator
       generator = ReportGenerator()
       
       report_path = generator.generate_report(
           model_result={},
           preprocessing_record={},
           test_results={},
           descriptive_stats={},
           data_source_info={}
       )
       
       assert report_path.endswith(".docx")
       assert os.path.exists(report_path)
       
       # 验证可被python-docx读取
       from docx import Document
       doc = Document(report_path)
       assert len(doc.paragraphs) > 0
   ```

#### Phase 6 完成条件（必需）

**验证方式**：`pytest tests/test_phase6_*.py -v`

1. **路由注册验证**
   ```bash
   # 检查app.py包含所有路由注册
   grep -q "include_router(preprocessing.router)" /root/stock-mcp/src/server/app.py && \
   grep -q "include_router(statistics.router)" /root/stock-mcp/src/server/app.py && \
   grep -q "include_router(models.router)" /root/stock-mcp/src/server/app.py && \
   grep -q "include_router(reports.router)" /root/stock-mcp/src/server/app.py
   ```

2. **FastAPI启动验证**
   ```bash
   # 启动服务并检查无错误（后台运行30秒）
   timeout 30 uvicorn src.server.app:app --host 0.0.0.0 --port 8000 2>&1 | grep -q "Application startup complete"
   ```

3. **Swagger文档验证**
   ```bash
   # 访问/docs可看到所有端点
   curl -s http://localhost:8000/docs | grep -q "/api/preprocessing" && \
   curl -s http://localhost:8000/docs | grep -q "/api/statistics" && \
   curl -s http://localhost:8000/docs | grep -q "/api/models" && \
   curl -s http://localhost:8000/docs | grep -q "/api/reports"
   ```

4. **端到端测试验证**
   ```python
   # pytest测试：运行完整流程测试
   def test_end_to_end_workflow():
       """完整流程：数据获取→预处理→统计检验→建模→报告生成"""
       
       # 1. 数据预处理
       response = requests.post("http://localhost:8000/api/preprocessing/clean", json={
           "filename": "test.csv",
           "value_col": "value"
       })
       assert response.status_code == 200
       
       # 2. 统计检验
       response = requests.post("http://localhost:8000/api/statistics/univariate", json={
           "filename": "test_cleaned.csv",
           "value_col": "value"
       })
       assert response.status_code == 200
       
       # 3. 模型构建
       response = requests.post("http://localhost:8000/api/models/arima", json={
           "filename": "test_cleaned.csv",
           "value_col": "value"
       })
       assert response.status_code == 200
       
       # 4. 报告生成
       response = requests.post("http://localhost:8000/api/reports/generate", json={
           "model_result_path": "/path/to/model.json",
           ...
       })
       assert response.status_code == 200
   ```

### 最终验收清单

在完成所有Phase后，检查以下关键功能：

- [ ] **数据获取**：至少1个AKShare工具可获取数据并保存中文文件名
- [ ] **数据清洗**：缺失值和异常值使用ffill填充（非删除）
- [ ] **统计检验**：至少运行1次单变量检验，返回4项结果
- [ ] **模型构建**：至少成功运行1次ARIMA或GARCH建模
- [ ] **报告生成**：至少生成1份Word报告（即使AI部分用降级模板）
- [ ] **API可用**：所有新增API端点在Swagger文档中可见

### 输出完成所有Phase并通过最终验收清单后输出:<promise>DONE</promise>的时机

**仅当以上所有条件全部满足时**，才可输出以下内容：

```
===== TASK COMPLETION REPORT =====

Phase 1: AKShare数据获取 ✅ PASSED
Phase 2: 数据预处理 ✅ PASSED
Phase 3: 统计检验 ✅ PASSED
Phase 4: 模型构建 ✅ PASSED
Phase 5: 报告生成 ✅ PASSED
Phase 6: 集成验证 ✅ PASSED

所有核心功能已实现并验证通过。

完成所有Phase并通过最终验收清单后输出:<promise>DONE</promise>
```

**如果任何一个Phase未通过验证**，不要输出完成所有Phase并通过最终验收清单后输出:<promise>DONE</promise>，而是报告具体问题并继续修复。

*最后更新：2026-01-15*

# CLAUDE.md - Phase 2: 数据预处理模块重构

## 📋 阶段目标

重构数据预处理逻辑，从"删除缺失值/异常值"改为"前值填充"，并新增用户可选的对数转换和差分转换功能。

**核心原则**：
- 缺失值和异常值统一用前值填充（ffill）
- 3σ法则检测异常值后标记为NaN再填充
- 对数转换和差分由用户手动选择
- 所有预处理操作可追溯（保存处理记录）
- 预处理后数据保存到独立目录

---

## 📚 术语定义

| 术语 | 定义 | 示例 |
|------|------|------|
| **前值填充（ffill）** | 用前面最近的有效值填充缺失值或异常值 | `[1, NaN, 3] → [1, 1, 3]` |
| **3σ法则** | 统计中判断异常值的方法：值超出均值±3倍标准差范围视为异常 | `mean=100, std=10, 异常值: x<70 或 x>130` |
| **对数转换** | `log(x)` 或 `log(1+x)`，用于消除异方差性、平滑数据 | 价格数据常用 |
| **差分转换** | 一阶差分 `Δx(t) = x(t) - x(t-1)`，用于消除趋势、实现平稳性 | 非平稳序列常用 |
| **预处理记录** | JSON格式记录所有预处理操作，用于报告生成 | `{"missing_filled": 5, "outliers_filled": 2, "log_applied": true}` |
| **处理后数据目录** | `/root/librechat_user_data/{user_id}/processed/` | 与原始数据目录分离 |

---

## 🔍 现有实现分析

### 当前实现（存在问题）

**文件**：`/root/test/utils/data_processor.py`

**问题代码**（第22-35行）：
```python
# ❌ 错误逻辑1：直接删除缺失值
df = df.dropna(subset=[value_col])
if len(df) < initial_len:
    logging.info(f"Dropped {initial_len - len(df)} NaN rows from {filepath}")

# ❌ 错误逻辑2：直接删除异常值
outliers = df[(df[value_col] > upper_bound) | (df[value_col] < lower_bound)]
if not outliers.empty:
    logging.info(f"Removing {len(outliers)} extreme outliers from {filepath}")
    df = df[(df[value_col] <= upper_bound) & (df[value_col] >= lower_bound)]
```

**问题说明**：
1. 删除缺失值会导致时间序列不连续
2. 删除异常值同样导致数据缺失
3. 无法保留原始数据的时间完整性

### 需求逻辑（正确方法）

**核心思想**：不删除任何数据，而是用填充替代

**正确代码**：
```python
# ✅ 正确逻辑1：前值填充缺失值
initial_missing = df[value_col].isna().sum()
df[value_col] = df[value_col].ffill()
final_missing = df[value_col].isna().sum()
logging.info(f"填充了 {initial_missing - final_missing} 个缺失值")

# ✅ 正确逻辑2：检测异常值后标记为NaN，再填充
mean_val = df[value_col].mean()
std_val = df[value_col].std()
upper_bound = mean_val + 3 * std_val
lower_bound = mean_val - 3 * std_val

outlier_mask = (df[value_col] > upper_bound) | (df[value_col] < lower_bound)
outlier_count = outlier_mask.sum()
df.loc[outlier_mask, value_col] = np.nan
df[value_col] = df[value_col].ffill()
logging.info(f"检测到 {outlier_count} 个异常值，已用前值填充")
```

---

## 🎯 详细任务清单

### Task 2.1: 重构数据清洗服务

**目标**：创建新的数据预处理服务，替换测试代码中的错误逻辑

#### 子任务 2.1.1: 创建预处理服务类

**文件**：`/root/stock-mcp/src/server/domain/services/data_preprocessing_service.py`

**实现内容**：
```python
"""数据预处理服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class DataPreprocessingService:
    """数据预处理服务类"""
    
    def __init__(self):
        self.processing_log = []
    
    def clean_data(
        self, 
        df: pd.DataFrame, 
        value_col: str = 'close_price',
        timestamp_col: str = 'timestamp'
    ) -> tuple[pd.DataFrame, Dict[str, Any]]:
        """
        数据清洗：处理缺失值和异常值
        
        Args:
            df: 原始数据DataFrame
            value_col: 数据列名
            timestamp_col: 时间戳列名
        
        Returns:
            (处理后的DataFrame, 处理记录)
        """
        processing_record = {
            "original_length": len(df),
            "missing_count": 0,
            "outlier_count": 0,
            "final_length": 0
        }
        
        # 确保时间列为datetime类型并排序
        if timestamp_col in df.columns:
            df[timestamp_col] = pd.to_datetime(df[timestamp_col], utc=True).dt.tz_convert(None)
            df = df.sort_values(timestamp_col).reset_index(drop=True)
        
        # 步骤1: 统计并填充缺失值
        initial_missing = df[value_col].isna().sum()
        processing_record["missing_count"] = int(initial_missing)
        
        df[value_col] = df[value_col].ffill()  # 前值填充
        
        remaining_missing = df[value_col].isna().sum()
        if remaining_missing > 0:
            # 如果开头有缺失值（无前值可填充），用后值填充
            df[value_col] = df[value_col].bfill()
            logger.warning(f"开头有 {remaining_missing} 个缺失值，使用后值填充")
        
        logger.info(f"填充了 {initial_missing} 个缺失值")
        
        # 步骤2: 3σ法则检测并填充异常值
        mean_val = df[value_col].mean()
        std_val = df[value_col].std()
        upper_bound = mean_val + 3 * std_val
        lower_bound = mean_val - 3 * std_val
        
        outlier_mask = (df[value_col] > upper_bound) | (df[value_col] < lower_bound)
        outlier_count = int(outlier_mask.sum())
        processing_record["outlier_count"] = outlier_count
        
        if outlier_count > 0:
            # 记录异常值位置和原始值（用于报告）
            outlier_indices = df[outlier_mask].index.tolist()
            outlier_values = df.loc[outlier_mask, value_col].tolist()
            processing_record["outlier_details"] = {
                "indices": outlier_indices[:10],  # 只记录前10个
                "values": [float(v) for v in outlier_values[:10]]
            }
            
            # 标记为NaN并填充
            df.loc[outlier_mask, value_col] = np.nan
            df[value_col] = df[value_col].ffill()
            
            logger.info(f"检测到 {outlier_count} 个异常值（3σ法则），已用前值填充")
        
        processing_record["final_length"] = len(df)
        processing_record["mean"] = float(mean_val)
        processing_record["std"] = float(std_val)
        processing_record["upper_bound"] = float(upper_bound)
        processing_record["lower_bound"] = float(lower_bound)
        
        return df, processing_record
    
    def apply_log_transform(
        self, 
        df: pd.DataFrame, 
        value_col: str = 'close_price',
        log_type: str = 'log'
    ) -> tuple[pd.DataFrame, Dict[str, Any]]:
        """
        对数转换
        
        Args:
            df: 数据DataFrame
            value_col: 数据列名
            log_type: 'log' (自然对数) 或 'log1p' (log(1+x))
        
        Returns:
            (转换后的DataFrame, 转换记录)
        """
        transform_record = {
            "transform_type": log_type,
            "column": value_col,
            "original_min": float(df[value_col].min()),
            "original_max": float(df[value_col].max())
        }
        
        # 检查是否有非正值
        if df[value_col].min() <= 0 and log_type == 'log':
            raise ValueError(f"数据包含非正值（最小值: {df[value_col].min()}），无法进行自然对数转换。请使用log1p或先处理负值。")
        
        # 应用对数转换
        if log_type == 'log':
            df[value_col] = np.log(df[value_col])
        elif log_type == 'log1p':
            df[value_col] = np.log1p(df[value_col])
        else:
            raise ValueError(f"未知的对数类型: {log_type}")
        
        transform_record["transformed_min"] = float(df[value_col].min())
        transform_record["transformed_max"] = float(df[value_col].max())
        
        logger.info(f"应用 {log_type} 转换成功")
        
        return df, transform_record
    
    def apply_diff(
        self, 
        df: pd.DataFrame, 
        value_col: str = 'close_price',
        order: int = 1
    ) -> tuple[pd.DataFrame, Dict[str, Any]]:
        """
        差分转换
        
        Args:
            df: 数据DataFrame
            value_col: 数据列名
            order: 差分阶数（1或2）
        
        Returns:
            (转换后的DataFrame, 转换记录)
        """
        transform_record = {
            "transform_type": f"diff_order_{order}",
            "column": value_col,
            "original_length": len(df)
        }
        
        # 应用差分
        df[value_col] = df[value_col].diff(order)
        
        # 差分后前几行为NaN，删除这些行
        initial_len = len(df)
        df = df.dropna(subset=[value_col]).reset_index(drop=True)
        dropped_rows = initial_len - len(df)
        
        transform_record["dropped_rows"] = dropped_rows
        transform_record["final_length"] = len(df)
        
        logger.info(f"应用 {order} 阶差分，删除了前 {dropped_rows} 行NaN")
        
        return df, transform_record
    
    def get_descriptive_stats(
        self, 
        df: pd.DataFrame, 
        value_col: str = 'close_price'
    ) -> Dict[str, float]:
        """
        计算描述性统计
        
        Args:
            df: 数据DataFrame
            value_col: 数据列名
        
        Returns:
            包含统计指标的字典
        """
        series = df[value_col]
        stats_dict = {
            'count': int(len(series)),
            'min': float(series.min()),
            'max': float(series.max()),
            'mean': float(series.mean()),
            'median': float(series.median()),
            'std': float(series.std()),
            'skewness': float(series.skew()),
            'kurtosis': float(series.kurtosis())
        }
        
        return stats_dict
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] `clean_data()` 方法实现正确（ffill逻辑）
- [ ] `apply_log_transform()` 支持log和log1p
- [ ] `apply_diff()` 支持1阶和2阶差分
- [ ] 所有方法返回处理记录

#### 子任务 2.1.2: 修改测试代码中的预处理逻辑

**目标**：更新`/root/test/utils/data_processor.py`，使其与新服务保持一致

**文件**：`/root/test/utils/data_processor.py`

**修改方案**：
1. 保留原文件作为备份：`data_processor.py.bak`
2. 修改`load_and_clean_data()`函数中的清洗逻辑
3. 使用与服务类相同的ffill逻辑

**修改后的代码**（第22-40行）：
```python
# 步骤1: 填充缺失值（而非删除）
initial_missing = df[value_col].isna().sum()
df[value_col] = df[value_col].ffill()
remaining_missing = df[value_col].isna().sum()
if remaining_missing > 0:
    df[value_col] = df[value_col].bfill()
    logging.info(f"开头有 {remaining_missing} 个缺失值，使用后值填充")
logging.info(f"填充了 {initial_missing} 个缺失值")

# 步骤2: 3σ法则检测并填充异常值（而非删除）
mean_val = df[value_col].mean()
std_val = df[value_col].std()
upper_bound = mean_val + 3 * std_val
lower_bound = mean_val - 3 * std_val

outlier_mask = (df[value_col] > upper_bound) | (df[value_col] < lower_bound)
outlier_count = outlier_mask.sum()
if outlier_count > 0:
    logging.info(f"检测到 {outlier_count} 个异常值（3σ法则），用前值填充")
    df.loc[outlier_mask, value_col] = np.nan
    df[value_col] = df[value_col].ffill()
```

**验证标准**：
- [ ] 原文件已备份为`.bak`
- [ ] `dropna()`调用已移除
- [ ] 异常值删除逻辑已改为填充
- [ ] 测试脚本`/root/test/run_tests.py`运行成功

---

### Task 2.2: 创建预处理API端点

**目标**：创建FastAPI路由，提供数据预处理服务

#### 子任务 2.2.1: 创建API路由文件

**文件**：`/root/stock-mcp/src/server/api/routes/preprocessing.py`

**实现内容**：
```python
"""数据预处理API路由"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Optional, List, Literal
from pydantic import BaseModel
import pandas as pd
import os
from src.server.domain.services.data_preprocessing_service import DataPreprocessingService
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/preprocessing", tags=["preprocessing"])

# ===== 请求模型 =====

class CleanDataRequest(BaseModel):
    """数据清洗请求"""
    filename: str  # 用户数据目录中的文件名
    value_col: str = "close_price"
    timestamp_col: str = "timestamp"

class TransformRequest(BaseModel):
    """数据转换请求"""
    filename: str  # 已清洗的文件名
    transform_type: Literal["log", "log1p", "diff", "diff2"]
    value_col: str = "close_price"

class PreprocessingResponse(BaseModel):
    """预处理响应"""
    success: bool
    saved_path: Optional[str] = None
    processing_record: Optional[dict] = None
    error: Optional[str] = None

# ===== API端点 =====

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_data(request: CleanDataRequest):
    """
    数据清洗接口
    
    功能：
    1. 读取用户原始数据
    2. 填充缺失值（ffill）
    3. 检测并填充异常值（3σ法则）
    4. 保存到processed目录
    
    Args:
        request: 包含文件名和列名的请求
    
    Returns:
        处理结果和保存路径
    """
    try:
        user_id = get_current_user_id() or "anonymous"
        
        # 读取原始数据
        input_path = f"/root/librechat_user_data/{user_id}/dataset/{request.filename}"
        if not os.path.exists(input_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {request.filename}")
        
        df = pd.read_csv(input_path)
        
        # 执行清洗
        service = DataPreprocessingService()
        cleaned_df, record = service.clean_data(
            df, 
            value_col=request.value_col,
            timestamp_col=request.timestamp_col
        )
        
        # 保存清洗后的数据
        output_dir = f"/root/librechat_user_data/{user_id}/processed"
        os.makedirs(output_dir, exist_ok=True)
        
        # 文件名添加_cleaned后缀
        base_name = request.filename.replace('.csv', '')
        output_path = os.path.join(output_dir, f"{base_name}_cleaned.csv")
        cleaned_df.to_csv(output_path, index=False, encoding='utf-8-sig')
        
        logger.info(f"数据清洗完成: {output_path}")
        
        return PreprocessingResponse(
            success=True,
            saved_path=output_path,
            processing_record=record
        )
    
    except Exception as e:
        logger.error(f"数据清洗失败: {e}")
        return PreprocessingResponse(
            success=False,
            error=str(e)
        )

@router.post("/transform", response_model=PreprocessingResponse)
async def transform_data(request: TransformRequest):
    """
    数据转换接口
    
    功能：
    1. 对数转换（log, log1p）
    2. 差分转换（diff, diff2）
    
    Args:
        request: 包含文件名和转换类型的请求
    
    Returns:
        转换结果和保存路径
    """
    try:
        user_id = get_current_user_id() or "anonymous"
        
        # 读取已清洗的数据
        input_path = f"/root/librechat_user_data/{user_id}/processed/{request.filename}"
        if not os.path.exists(input_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {request.filename}")
        
        df = pd.read_csv(input_path)
        
        # 执行转换
        service = DataPreprocessingService()
        
        if request.transform_type in ["log", "log1p"]:
            transformed_df, record = service.apply_log_transform(
                df, 
                value_col=request.value_col,
                log_type=request.transform_type
            )
            suffix = f"_{request.transform_type}"
        
        elif request.transform_type in ["diff", "diff2"]:
            order = 1 if request.transform_type == "diff" else 2
            transformed_df, record = service.apply_diff(
                df, 
                value_col=request.value_col,
                order=order
            )
            suffix = f"_diff{order}"
        
        else:
            raise HTTPException(status_code=400, detail=f"未知的转换类型: {request.transform_type}")
        
        # 保存转换后的数据
        base_name = request.filename.replace('.csv', '')
        output_path = f"/root/librechat_user_data/{user_id}/processed/{base_name}{suffix}.csv"
        transformed_df.to_csv(output_path, index=False, encoding='utf-8-sig')
        
        logger.info(f"数据转换完成: {output_path}")
        
        return PreprocessingResponse(
            success=True,
            saved_path=output_path,
            processing_record=record
        )
    
    except Exception as e:
        logger.error(f"数据转换失败: {e}")
        return PreprocessingResponse(
            success=False,
            error=str(e)
        )

@router.get("/stats/{filename}")
async def get_statistics(filename: str, value_col: str = "close_price"):
    """
    获取数据的描述性统计
    
    Args:
        filename: 文件名（在processed目录中）
        value_col: 数据列名
    
    Returns:
        统计指标字典
    """
    try:
        user_id = get_current_user_id() or "anonymous"
        file_path = f"/root/librechat_user_data/{user_id}/processed/{filename}"
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")
        
        df = pd.read_csv(file_path)
        
        service = DataPreprocessingService()
        stats = service.get_descriptive_stats(df, value_col=value_col)
        
        return {
            "success": True,
            "filename": filename,
            "statistics": stats
        }
    
    except Exception as e:
        logger.error(f"获取统计数据失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**验证标准**：
- [ ] 路由文件创建成功
- [ ] 3个端点全部实现（clean, transform, stats）
- [ ] 请求/响应模型定义正确
- [ ] 用户级别文件路径处理正确

#### 子任务 2.2.2: 注册路由到FastAPI应用

**文件**：`/root/stock-mcp/src/server/app.py`

**修改内容**：
```python
from src.server.api.routes import preprocessing

# 在app初始化后注册路由
app.include_router(preprocessing.router)
```

**验证标准**：
- [ ] 路由注册成功
- [ ] FastAPI启动无错误
- [ ] Swagger文档（`/docs`）显示3个新端点

---

### Task 2.3: 前端数据预览页面集成

**目标**：在前端"数据预览"页面添加预处理选项

#### 子任务 2.3.1: 修改数据预览页面

**文件**：`/root/frontend/src/pages/data-preview/page.tsx`

**新增功能**：
1. 预处理选项勾选框（清洗、对数、差分）
2. 调用预处理API
3. 显示预处理结果

**实现内容**（关键代码片段）：
```typescript
// 新增状态
const [availableColumns, setAvailableColumns] = useState<string[]>([]);
const [selectedValueColumn, setSelectedValueColumn] = useState<string>('');
const [selectedTimeColumn, setSelectedTimeColumn] = useState<string>('');

const [preprocessingOptions, setPreprocessingOptions] = useState({
  clean: false,
  logTransform: false,
  logType: 'log' as 'log' | 'log1p',
  diff: false,
  diffOrder: 1
});

const [processingStatus, setProcessingStatus] = useState<string>('');

// ⚠️ 关键功能：动态获取CSV列名
const fetchColumnNames = async (filename: string) => {
  try {
    // 先读取CSV预览数据
    const response = await fetch(`/api/data/preview/${filename}`);
    const previewData = await response.json();
    
    if (previewData.columns) {
      setAvailableColumns(previewData.columns);
      
      // 自动识别可能的时间列和数值列
      const timeColumn = previewData.columns.find(col => 
        col.includes('时间') || col.includes('日期') || col.toLowerCase().includes('time') || col.toLowerCase().includes('date')
      );
      const valueColumn = previewData.columns.find(col => 
        col.includes('今值') || col.includes('值') || col.toLowerCase().includes('price') || col.toLowerCase().includes('value')
      );
      
      if (timeColumn) setSelectedTimeColumn(timeColumn);
      if (valueColumn) setSelectedValueColumn(valueColumn);
    }
  } catch (error) {
    console.error('获取列名失败:', error);
  }
};

// 文件加载时自动获取列名
useEffect(() => {
  if (filename) {
    fetchColumnNames(filename);
  }
}, [filename]);

// 预处理函数
const handlePreprocess = async () => {
  if (!filename || !selectedValueColumn) {
    toast.error('请先选择要处理的数据列');
    return;
  }
  
  try {
    setProcessingStatus('处理中...');
    
    // 步骤1: 数据清洗（如果勾选）
    let currentFile = filename;
    if (preprocessingOptions.clean) {
      const cleanRes = await fetch('/api/preprocessing/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename,
          value_col: selectedValueColumn,  // ✅ 使用用户选择的列名
          timestamp_col: selectedTimeColumn
        })
      });
      const cleanData = await cleanRes.json();
      
      if (!cleanData.success) {
        throw new Error(cleanData.error);
      }
      
      currentFile = cleanData.saved_path.split('/').pop();
      setProcessingStatus('数据清洗完成');
    }
    
    // 步骤2: 对数转换（如果勾选）
    if (preprocessingOptions.logTransform) {
      const logRes = await fetch('/api/preprocessing/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: currentFile,
          transform_type: preprocessingOptions.logType,
          value_col: selectedValueColumn  // ✅ 使用用户选择的列名
        })
      });
      const logData = await logRes.json();
      
      if (!logData.success) {
        throw new Error(logData.error);
      }
      
      currentFile = logData.saved_path.split('/').pop();
      setProcessingStatus('对数转换完成');
    }
    
    // 步骤3: 差分转换（如果勾选）
    if (preprocessingOptions.diff) {
      const diffRes = await fetch('/api/preprocessing/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: currentFile,
          transform_type: preprocessingOptions.diffOrder === 1 ? 'diff' : 'diff2',
          value_col: selectedValueColumn  // ✅ 使用用户选择的列名
        })
      });
      const diffData = await diffRes.json();
      
      if (!diffData.success) {
        throw new Error(diffData.error);
      }
      
      currentFile = diffData.saved_path.split('/').pop();
      setProcessingStatus('差分转换完成');
    }
    
    setProcessingStatus('所有预处理完成！');
    toast.success('数据预处理成功');
    
    // 刷新预览数据
    fetchData();
    
  } catch (error) {
    toast.error(`预处理失败: ${error.message}`);
    setProcessingStatus('');
  }
};

// UI组件（添加到现有页面中）
<div className="preprocessing-panel">
  <h3>数据预处理选项</h3>
  
  {/* ✅ 新增：列名选择器 */}
  <div className="column-selector">
    <label>
      选择时间列：
      <select 
        value={selectedTimeColumn}
        onChange={(e) => setSelectedTimeColumn(e.target.value)}
      >
        <option value="">-- 请选择 --</option>
        {availableColumns.map(col => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </label>
    
    <label>
      选择数据列：
      <select 
        value={selectedValueColumn}
        onChange={(e) => setSelectedValueColumn(e.target.value)}
        required
      >
        <option value="">-- 请选择（必选）--</option>
        {availableColumns.map(col => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </label>
    
    {/* ⚠️ 提示信息 */}
    {!selectedValueColumn && (
      <p className="warning-text">
        ⚠️ 不同数据源的列名不同（如GDP为"今值"，股票为"close_price"），请根据实际CSV选择
      </p>
    )}
  </div>
  
  {/* 原有的预处理选项 */}
  <label>
    <input 
      type="checkbox" 
      checked={preprocessingOptions.clean}
      onChange={(e) => setPreprocessingOptions({
        ...preprocessingOptions, 
        clean: e.target.checked
      })}
    />
    数据清洗（填充缺失值和异常值）
  </label>
  
  {/* ⚠️ 新增：3σ异常检测提示 */}
  {preprocessingOptions.clean && (
    <p className="info-text">
      💡 建议：对于有趋势的宏观数据（如GDP），建议先差分再清洗
    </p>
  )}
  
  <label>
    <input 
      type="checkbox" 
      checked={preprocessingOptions.logTransform}
      onChange={(e) => setPreprocessingOptions({
        ...preprocessingOptions, 
        logTransform: e.target.checked
      })}
    />
    对数转换
    <select 
      value={preprocessingOptions.logType}
      onChange={(e) => setPreprocessingOptions({
        ...preprocessingOptions, 
        logType: e.target.value as 'log' | 'log1p'
      })}
      disabled={!preprocessingOptions.logTransform}
    >
      <option value="log">自然对数 log(x)</option>
      <option value="log1p">log(1+x)</option>
    </select>
  </label>
  
  <label>
    <input 
      type="checkbox" 
      checked={preprocessingOptions.diff}
      onChange={(e) => setPreprocessingOptions({
        ...preprocessingOptions, 
        diff: e.target.checked
      })}
    />
    差分转换
    <select 
      value={preprocessingOptions.diffOrder}
      onChange={(e) => setPreprocessingOptions({
        ...preprocessingOptions, 
        diffOrder: parseInt(e.target.value)
      })}
      disabled={!preprocessingOptions.diff}
    >
      <option value="1">一阶差分</option>
      <option value="2">二阶差分</option>
    </select>
  </label>
  
  {/* ⚠️ 新增：差分警告 */}
  {preprocessingOptions.diff && (
    <p className="warning-text">
      ⚠️ 差分操作会删除前{preprocessingOptions.diffOrder}行数据（这是数学必然，非bug）
    </p>
  )}
  
  <button onClick={handlePreprocess} disabled={!selectedValueColumn}>
    执行预处理
  </button>
  
  {processingStatus && (
    <div className="status-message">{processingStatus}</div>
  )}
</div>
```

**验证标准**：
- [ ] 页面加载时自动获取CSV列名列表
- [ ] 显示列名下拉框，用户可选择时间列和数据列
- [ ] 自动识别可能的时间列和数值列（智能默认）
- [ ] 未选择数据列时禁用"执行预处理"按钮
- [ ] 显示关于不同数据源列名的警告提示
- [ ] 显示关于趋势数据的3σ局限性提示
- [ ] 显示关于差分删除行数的警告

---

### Task 2.4: 创建预处理验证测试

**目标**：验证预处理逻辑的正确性

**文件**：`/root/stock-mcp/tests/test_preprocessing.py`

**实现内容**：
```python
"""数据预处理测试"""

import pytest
import pandas as pd
import numpy as np
from src.server.domain.services.data_preprocessing_service import DataPreprocessingService

@pytest.fixture
def sample_data():
    """创建测试数据"""
    data = {
        'timestamp': pd.date_range('2024-01-01', periods=100, freq='D'),
        'close_price': np.random.randn(100) * 10 + 100
    }
    df = pd.DataFrame(data)
    
    # 人工添加缺失值
    df.loc[10, 'close_price'] = np.nan
    df.loc[20, 'close_price'] = np.nan
    
    # 人工添加异常值
    df.loc[30, 'close_price'] = 1000  # 极大值
    df.loc[40, 'close_price'] = -50   # 负值
    
    return df

def test_clean_data_fills_missing(sample_data):
    """测试：缺失值填充"""
    service = DataPreprocessingService()
    cleaned_df, record = service.clean_data(sample_data)
    
    # 验证：无缺失值
    assert cleaned_df['close_price'].isna().sum() == 0
    
    # 验证：记录正确
    assert record['missing_count'] == 2
    assert record['final_length'] == 100

def test_clean_data_fills_outliers(sample_data):
    """测试：异常值填充"""
    service = DataPreprocessingService()
    cleaned_df, record = service.clean_data(sample_data)
    
    # 验证：异常值被处理
    assert record['outlier_count'] >= 2  # 至少检测到2个异常值
    
    # 验证：所有值在合理范围内
    mean = record['mean']
    std = record['std']
    assert cleaned_df['close_price'].max() <= mean + 3 * std
    assert cleaned_df['close_price'].min() >= mean - 3 * std

def test_log_transform():
    """测试：对数转换"""
    data = {
        'close_price': [1, 2, 3, 4, 5]
    }
    df = pd.DataFrame(data)
    
    service = DataPreprocessingService()
    
    # 测试自然对数
    log_df, record = service.apply_log_transform(df.copy(), log_type='log')
    assert np.allclose(log_df['close_price'], np.log([1, 2, 3, 4, 5]))
    
    # 测试log1p
    log1p_df, record = service.apply_log_transform(df.copy(), log_type='log1p')
    assert np.allclose(log1p_df['close_price'], np.log1p([1, 2, 3, 4, 5]))

def test_diff_transform():
    """测试：差分转换"""
    data = {
        'close_price': [10, 12, 15, 13, 18]
    }
    df = pd.DataFrame(data)
    
    service = DataPreprocessingService()
    
    # 测试一阶差分
    diff1_df, record = service.apply_diff(df.copy(), order=1)
    expected = [2, 3, -2, 5]  # 10->12(+2), 12->15(+3), 15->13(-2), 13->18(+5)
    assert list(diff1_df['close_price']) == expected
    assert record['dropped_rows'] == 1
    
    # 测试二阶差分
    diff2_df, record = service.apply_diff(df.copy(), order=2)
    assert record['dropped_rows'] == 2

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

**验证标准**：
- [ ] 所有测试用例通过
- [ ] 缺失值填充逻辑正确
- [ ] 异常值检测和填充正确
- [ ] 对数转换结果准确
- [ ] 差分转换结果准确

---

## ⚠️ 注意事项与常见陷阱

### ⚠️ 关键：列名动态处理（不同数据源列名不同）
**问题**：
- 代码模板中使用了硬编码的 `value_col = 'close_price'`
- 但本平台涵盖**9大类数据**（宏观、利率、外汇、期货、期权、债券、现货、指数、其他）
- 不同数据源的列名**完全不同**：
  - 宏观数据（如GDP）：列名为 `"今值"`、`"预测值"`、`"前值"`
  - 货币供应量：列名为 `"货币和准货币(M2)-数量(亿元)"`
  - 股票数据才有 `close_price`

**解决方案**（必须实现）：
1. **API接口必须接受动态列名**：`value_col` 参数不能有默认值，或默认值设为 `None` 后自动检测数值列
2. **前端必须动态传递列名**：
   - 用户选择文件后，先调用接口获取CSV的列名列表
   - 前端显示下拉框，让用户选择"时间列"和"数据列"
   - 将用户选择的列名传递给预处理API
3. **代码示例中的 `'close_price'` 仅作演示**，实际调用时必须根据文件类型传入正确列名

**验证方法**：
- 测试宏观数据（如 `中国GDP年率.csv`）时，必须传入 `value_col='今值'`
- 测试货币供应量时，必须传入完整的中文列名

---

### ⚠️ 差分操作是"不删除原则"的唯一例外
**问题**：
- Phase 2强调"缺失值/异常值不删除，用填充替代"
- 但 `apply_diff()` 方法使用了 `df.dropna()`，删除了前 d 行数据
- 这看似与"不删除"原则冲突

**澄清**：
- 差分操作删除前几行是**数学必然**，不是bug：
  - 一阶差分：`Δx(t) = x(t) - x(t-1)`，第1行没有 `t-1`，必然为 NaN
  - 二阶差分：前2行都为 NaN
- 这是时间序列分析中的**标准做法**，不属于数据丢失

**处理建议**：
- 在 `processing_record` 中明确记录 `dropped_rows` 数量
- 前端UI提示用户："差分操作会缩短数据集，删除前 X 行"
- 在学术报告中说明："经一阶差分后，有效样本量为 N-1"

---

### ⚠️ 3σ 异常值检测的局限性（趋势性数据）
**问题**：
- 当前使用**全局均值和标准差**进行 3σ 检测
- 对于有**强趋势性**的宏观数据（如GDP、货币供应量），这可能导致误判：
  - 例如：GDP在20年间翻了数倍，早期的正常数据可能被误判为"异常值（太低）"
  - 晚期的正常增长可能被误判为"异常值（太高）"

**解决方案**（分优先级）：

**方案1：建议用户先差分再检测**（推荐）
- 在文档和前端UI中提示：
  > "对于具有明显趋势的宏观数据，建议先进行差分转换（消除趋势），再执行异常值检测"
  
- 操作顺序应为：
  1. 先差分（消除趋势）
  2. 再检测异常值（此时序列已平稳）
  3. 再做后续分析

**方案2：支持滚动窗口 3σ**（可选，不强制）
- 如果时间允许，可在 `clean_data()` 方法中增加可选参数：
  ```python
  def clean_data(self, df, value_col, use_rolling=False, window_size=20):
      if use_rolling:
          # 使用滚动窗口计算局部均值和标准差
  ```
- 但这会增加复杂度，**不作为Phase 2的必需功能**

**方案3：用户手动干预**（底线方案）
- 如果数据确实有趋势，用户可以：
  1. 先不做异常检测（跳过清洗）
  2. 直接差分
  3. 之后手动筛查异常值

**验证建议**：
- 在"注意事项"文档中明确说明此局限性
- 在前端UI添加提示："建议先差分再检测异常值"

---

### 1. 前值填充的边界情况
**问题**：数据开头如果有缺失值，ffill()无法填充
**解决方案**：`df.ffill().bfill()` 双向填充

### 2. 对数转换的负值问题
**问题**：`log(x)` 要求 x > 0，价格数据可能有0或负值
**解决方案**：
- 数据清洗时检查并处理负值
- 或使用 `log1p(x)` 避免log(0)问题
- 提供友好的错误提示

### 3. 差分后数据长度变化
**问题**：一阶差分丢失1行，二阶差分丢失2行
**解决方案**：
- 在`processing_record`中明确记录丢失的行数
- 前端提示用户数据长度变化

### 4. 连续异常值的填充
**问题**：如果连续多个值都是异常值，ffill会用很早的值填充
**解决方案**：
- 这是合理的（用户已确认）
- 在`processing_record`中记录连续异常值的情况
- 报告中提醒用户

### 5. 预处理顺序
**问题**：清洗、对数、差分的顺序影响结果
**解决方案**：
- 强制顺序：清洗 → 对数 → 差分
- API设计确保用户按此顺序操作
- 前端UI引导用户

### 6. 文件命名冲突
**问题**：多次预处理可能覆盖文件
**解决方案**：
- 文件名添加明确后缀（`_cleaned`, `_log`, `_diff1`）
- 保留中间结果，不覆盖

---

## ✅ 阶段验收标准

完成Phase 2后，应达到以下标准：

1. **服务层**
   - [ ] `DataPreprocessingService`类创建成功
   - [ ] `clean_data()`、`apply_log_transform()`、`apply_diff()`方法实现正确
   - [ ] 测试代码`/root/test/utils/data_processor.py`已重构

2. **API层**
   - [ ] 3个预处理端点实现（`/clean`, `/transform`, `/stats`）
   - [ ] API文档（Swagger）可访问
   - [ ] 端到端测试通过

3. **前端集成**
   - [ ] 数据预览页面添加预处理选项
   - [ ] 可选择清洗、对数、差分
   - [ ] 显示处理进度和结果

4. **数据持久化**
   - [ ] 预处理数据保存到`processed/`目录
   - [ ] 文件命名规范（含后缀）
   - [ ] 处理记录保存为JSON

5. **测试覆盖**
   - [ ] 单元测试全部通过
   - [ ] 边界情况测试通过（负值、缺失值、异常值）

---

## 📝 下一阶段预告

完成Phase 2后，将进入**Phase 3: 统计检验模块扩展**，主要任务包括：
- 新增JB正态性检验
- 实现自动滞后阶数选择（Ljung-Box、ARCH LM）
- 新增多变量检验（Pearson相关、VIF、Panel ADF、Johansen、格兰杰因果）
- 创建统计检验API和前端页面

---

*本文档版本：v1.0*  
*最后更新：2026-01-15*

"""统计检验API路由"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any
import pandas as pd
import numpy as np
import os
import json
from datetime import datetime
from src.server.domain.services.statistical_tests_service import StatisticalTestsService
from src.server.domain.services.multivariate_tests_service import MultivariateTestsService
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/statistics", tags=["statistics"])

# ===== 🆕 自定义JSON编码器（处理numpy类型和NaN/Inf） =====

class NumpyJSONEncoder(json.JSONEncoder):
    """
    自定义JSON编码器，处理numpy数据类型和特殊值

    解决问题：
    1. numpy.int64/float64 → Python int/float
    2. np.nan → null (前端兼容)
    3. np.inf → null (避免前端JSON.parse报错)
    """
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            if np.isnan(obj) or np.isinf(obj):
                return None  # 转为null，前端可识别
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, pd.Series):
            return obj.tolist()
        elif isinstance(obj, pd.DataFrame):
            return obj.to_dict()
        return super().default(obj)

def sanitize_for_json(data: Any) -> Any:
    """
    递归清洗数据，确保JSON序列化安全

    Args:
        data: 任意数据结构

    Returns:
        清洗后的数据（所有numpy类型转为原生类型，NaN/Inf转为None）
    """
    if isinstance(data, dict):
        return {k: sanitize_for_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_json(item) for item in data]
    elif isinstance(data, (np.integer,)):
        return int(data)
    elif isinstance(data, (np.floating,)):
        if np.isnan(data) or np.isinf(data):
            return None
        return float(data)
    elif isinstance(data, np.ndarray):
        return sanitize_for_json(data.tolist())
    elif isinstance(data, float):
        if np.isnan(data) or np.isinf(data):
            return None
        return data
    else:
        return data

# ===== 请求模型 =====

class UnivariateTestRequest(BaseModel):
    """单变量检验请求"""
    filename: str  # 数据文件名
    value_col: str  # ⚠️ 必须由前端传入，不设默认值

class MultivariateTestRequest(BaseModel):
    """多变量检验请求"""
    filenames: List[str]  # 多个数据文件名
    value_col: str  # ⚠️ 数据列名（必需）
    date_col: Optional[str] = None  # 日期列名（用于对齐）

# ===== 🆕 数据预处理工具函数 =====

def safe_read_and_convert(file_path: str, value_col: str, date_col: Optional[str] = None) -> pd.DataFrame:
    """
    安全读取CSV并转换数据类型

    处理问题：
    1. 千分位符（如"1,200.00"）
    2. 货币符号（如"¥100"）
    3. 文本占位符（如"--"、"N/A"）

    Args:
        file_path: CSV文件路径
        value_col: 数据列名
        date_col: 日期列名（可选）

    Returns:
        清洗后的DataFrame
    """
    df = pd.read_csv(file_path)

    if value_col not in df.columns:
        raise ValueError(f"列不存在: {value_col}。可用列: {list(df.columns)}")

    # ⚠️ 强制转换为数值类型，无法解析的变为NaN
    df[value_col] = pd.to_numeric(df[value_col], errors='coerce')

    # 处理日期列（如果指定）
    if date_col and date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df = df.set_index(date_col).sort_index()

    return df

def align_multivariate_data(
    dfs: List[pd.DataFrame],
    names: List[str],
    date_col: Optional[str] = None
) -> pd.DataFrame:
    """
    对齐多变量数据（按日期索引inner join）

    ⚠️ 关键：使用日期索引对齐，而非简单concat

    Args:
        dfs: DataFrame列表
        names: 变量名列表
        date_col: 日期列名

    Returns:
        对齐后的DataFrame

    Raises:
        ValueError: 对齐后数据量不足
    """
    if not dfs:
        raise ValueError("没有数据可对齐")

    # 如果有日期索引，使用inner join
    if date_col and all(isinstance(df.index, pd.DatetimeIndex) for df in dfs):
        # 基于日期索引对齐
        merged = dfs[0].copy()
        merged.columns = [names[0]]

        for df, name in zip(dfs[1:], names[1:]):
            temp = df.copy()
            temp.columns = [name]
            merged = merged.join(temp, how='inner')
    else:
        # 无日期索引时，按行索引简单合并（并给出警告）
        logger.warning("未检测到日期索引，按行序号对齐。建议指定date_col参数以确保时间对齐。")
        merged = pd.concat([
            df.iloc[:, 0].rename(name) for df, name in zip(dfs, names)
        ], axis=1)

    # 删除任何包含NaN的行
    merged = merged.dropna()

    return merged

# ===== 结果保存函数 =====

def save_test_results(user_id: str, test_type: str, results: dict) -> str:
    """
    保存检验结果到用户目录

    Args:
        user_id: 用户ID
        test_type: 'univariate' 或 'multivariate'
        results: 检验结果字典

    Returns:
        保存的文件路径
    """
    models_dir = f"/root/librechat_user_data/{user_id}/models"
    os.makedirs(models_dir, exist_ok=True)

    filename = f"test_results_{test_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    file_path = os.path.join(models_dir, filename)

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2, cls=NumpyJSONEncoder)

    # 同时保存为latest版本（便于Phase 5直接读取）
    latest_path = os.path.join(models_dir, f"latest_test_results_{test_type}.json")
    with open(latest_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2, cls=NumpyJSONEncoder)

    logger.info(f"检验结果已保存: {file_path}")
    return file_path

# ===== API端点 =====

@router.post("/univariate")
async def run_univariate_tests(request: UnivariateTestRequest):
    """
    运行所有单变量检验

    包括：
    - ADF单位根检验
    - JB正态性检验
    - Ljung-Box Q检验（自动滞后）
    - ARCH LM检验（自动滞后）

    Args:
        request: 包含文件名和列名的请求

    Returns:
        所有检验结果（已做JSON安全处理）
    """
    try:
        user_id = get_current_user_id() or "anonymous"

        # 尝试从processed目录读取，若不存在则从dataset读取
        file_path = f"/root/librechat_user_data/{user_id}/processed/{request.filename}"
        if not os.path.exists(file_path):
            file_path = f"/root/librechat_user_data/{user_id}/dataset/{request.filename}"

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {request.filename}")

        # ⚠️ 使用安全读取函数
        df = safe_read_and_convert(file_path, request.value_col)
        series = df[request.value_col].dropna()

        # ⚠️ 样本量校验
        n = len(series)
        if n < 20:
            raise HTTPException(
                status_code=400,
                detail=f"样本量不足：当前{n}条，最少需要20条数据才能进行统计检验"
            )

        # 执行检验
        service = StatisticalTestsService()
        results = service.run_all_univariate_tests(series)

        # ⚠️ 清洗结果，确保JSON安全
        safe_results = sanitize_for_json(results)

        # 保存结果
        save_test_results(user_id, "univariate", safe_results)

        return {
            "success": True,
            "filename": request.filename,
            "column": request.value_col,
            "n_observations": n,
            "tests": safe_results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"单变量检验失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/multivariate")
async def run_multivariate_tests(request: MultivariateTestRequest):
    """
    运行所有多变量检验

    包括：
    - Pearson相关系数矩阵
    - VIF多重共线性检验
    - Panel ADF检验
    - Johansen协整检验
    - 格兰杰因果检验

    ⚠️ 返回纯JSON数据，热力图由前端渲染

    Args:
        request: 包含文件名列表、数据列名和日期列名的请求

    Returns:
        所有检验结果（JSON格式，前端自行渲染可视化）
    """
    try:
        user_id = get_current_user_id() or "anonymous"

        # 读取多个文件
        dfs = []
        names = []

        for filename in request.filenames:
            file_path = f"/root/librechat_user_data/{user_id}/processed/{filename}"
            if not os.path.exists(file_path):
                file_path = f"/root/librechat_user_data/{user_id}/dataset/{filename}"

            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

            # ⚠️ 使用安全读取函数（含数据类型转换）
            df = safe_read_and_convert(file_path, request.value_col, request.date_col)

            col_name = filename.replace('.csv', '').replace('_cleaned', '')
            df = df[[request.value_col]].rename(columns={request.value_col: col_name})

            dfs.append(df)
            names.append(col_name)

        # ⚠️ 使用日期索引对齐（而非简单concat）
        merged_df = align_multivariate_data(dfs, names, request.date_col)

        # ⚠️ 样本量校验
        n = len(merged_df)
        n_vars = len(merged_df.columns)

        # 格兰杰因果检验要求: n > 3 * max_lag + n_vars
        min_samples = max(30, 3 * 10 + n_vars)

        if n < min_samples:
            raise HTTPException(
                status_code=400,
                detail=f"对齐后样本量不足：当前{n}条，{n_vars}个变量至少需要{min_samples}条数据。"
                       f"请检查数据日期范围是否重叠，或选择时间跨度更长的数据。"
            )

        # 执行检验
        service = MultivariateTestsService()
        results = service.run_all_multivariate_tests(merged_df)

        # ⚠️ 清洗结果，确保JSON安全
        safe_results = sanitize_for_json(results)

        # 保存结果
        save_test_results(user_id, "multivariate", safe_results)

        return {
            "success": True,
            "filenames": request.filenames,
            "variables": names,
            "n_observations": n,
            "n_variables": n_vars,
            "tests": safe_results,
            # ⚠️ 返回相关矩阵的二维数组格式，便于前端渲染热力图
            "correlation_matrix_array": merged_df.corr().values.tolist() if n > 0 else None,
            "note": "可视化图表由前端渲染，API仅返回数据"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"多变量检验失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

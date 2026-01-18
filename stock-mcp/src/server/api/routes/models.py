"""时序模型API路由"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Tuple, Literal
import pandas as pd
import os
from src.server.domain.services.models.arima_service import ARIMAService
from src.server.domain.services.models.garch_service import GARCHService
from src.server.domain.services.models.var_service import VARVECMService
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger
import json
import numpy as np
from scipy.stats import jarque_bera
from statsmodels.tsa.stattools import adfuller
from statsmodels.stats.diagnostic import acorr_ljungbox, het_arch

router = APIRouter(prefix="/api/models", tags=["models"])

# ===== 请求模型 =====

class ARIMARequest(BaseModel):
    filename: str
    value_col: str = "close_price"
    order: Optional[List[int]] = None  # [p,d,q]
    start_date: Optional[str] = None  # 起始日期，格式: YYYY-MM-DD
    end_date: Optional[str] = None    # 结束日期，格式: YYYY-MM-DD
    date_col: Optional[str] = None    # 日期列名，默认自动识别

class GARCHRequest(BaseModel):
    filename: str
    value_col: str = "close_price"
    garch_order: Optional[List[int]] = None  # [p,q]
    mean_order: Optional[List[int]] = None   # [ar,ma]
    distribution: Literal['normal', 't', 'ged'] = 'normal'
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_col: Optional[str] = None

class VARRequest(BaseModel):
    filenames: List[str]
    value_col: str = "close_price"
    lags: Optional[int] = None
    include_granger: bool = True
    include_irf: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_col: Optional[str] = None

class VECMRequest(BaseModel):
    filenames: List[str]
    value_col: str = "close_price"
    coint_rank: Optional[int] = None
    lags: int = 1
    include_granger: bool = True
    include_irf: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_col: Optional[str] = None

# ===== 工具函数 =====

def _load_data(
    filename: str,
    user_id: str,
    value_col: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_col: Optional[str] = None
) -> pd.Series:
    """
    加载数据并支持日期范围过滤

    ⚠️ 重要说明：
    - 支持中文文件名（如"中国GDP年率.csv"、"货币供应量.csv"）
    - value_col参数必须由调用方正确传入，不同数据源列名不同：
      - 宏观数据（如GDP）：列名为"今值"、"前值"
      - 货币供应量：列名为"货币和准货币(M2)-数量(亿元)"等复杂中文
      - 股票数据：列名为"close_price"等英文

    Args:
        filename: 数据文件名（支持中文，如"LPR品种数据.csv"）
        user_id: 用户ID
        value_col: 数据列名（必须与CSV文件中的列名完全匹配）
        start_date: 起始日期（可选），格式: YYYY-MM-DD
        end_date: 结束日期（可选），格式: YYYY-MM-DD
        date_col: 日期列名（可选），若不指定则自动识别

    Returns:
        时间序列数据（已按日期范围过滤）

    Raises:
        FileNotFoundError: 文件不存在
        KeyError: 列名不存在
    """
    from urllib.parse import unquote

    # 处理可能的URL编码（中文文件名可能被编码）
    filename_decoded = unquote(filename)

    # 优先从processed目录加载，若不存在则从dataset加载
    file_path = f"/root/librechat_user_data/{user_id}/processed/{filename_decoded}"
    if not os.path.exists(file_path):
        file_path = f"/root/librechat_user_data/{user_id}/dataset/{filename_decoded}"

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {filename_decoded}（用户: {user_id}）")

    # 读取CSV（使用utf-8-sig处理可能的BOM）
    df = pd.read_csv(file_path, encoding='utf-8-sig')

    # 检查列名是否存在
    if value_col not in df.columns:
        available_cols = df.columns.tolist()
        raise KeyError(
            f"列名'{value_col}'不存在。\n"
            f"可用列名: {available_cols}\n"
            f"提示: 不同数据源的列名不同，请根据实际CSV选择正确的列名。"
        )

    # 日期范围过滤
    if start_date or end_date:
        # 自动识别日期列
        if date_col is None:
            date_col = _auto_detect_date_column(df)
            if date_col is None:
                logger.warning(f"未找到日期列，跳过日期过滤（文件: {filename_decoded}）")
                return df[value_col]

        if date_col not in df.columns:
            logger.warning(f"指定的日期列'{date_col}'不存在，跳过日期过滤")
            return df[value_col]

        # 转换日期列为datetime类型
        try:
            df[date_col] = pd.to_datetime(df[date_col])
        except Exception as e:
            logger.warning(f"日期列'{date_col}'转换失败: {e}，跳过日期过滤")
            return df[value_col]

        original_rows = len(df)

        # 验证日期范围有效性
        if start_date and end_date:
            start_dt = pd.to_datetime(start_date)
            end_dt = pd.to_datetime(end_date)
            if start_dt > end_dt:
                raise ValueError(
                    f"起始日期不能晚于结束日期: {start_date} > {end_date}"
                )

        # 应用日期过滤
        if start_date:
            start_dt = pd.to_datetime(start_date)
            df = df[df[date_col] >= start_dt]

        if end_date:
            end_dt = pd.to_datetime(end_date)
            df = df[df[date_col] <= end_dt]

        filtered_rows = len(df)

        # 验证过滤后是否还有数据
        if filtered_rows == 0:
            raise ValueError(
                f"日期过滤后无数据！\n"
                f"原始数据: {original_rows}行\n"
                f"过滤范围: {start_date or '开始'} ~ {end_date or '结束'}\n"
                f"请检查日期范围是否在数据集时间范围内。"
            )

        logger.info(
            f"日期过滤: {original_rows}行 → {filtered_rows}行 "
            f"(范围: {start_date or '开始'} ~ {end_date or '结束'})"
        )

    return df[value_col]


def _auto_detect_date_column(df: pd.DataFrame) -> Optional[str]:
    """
    自动识别日期列

    Args:
        df: DataFrame

    Returns:
        日期列名，若未找到则返回 None
    """
    # 常见日期列名
    date_keywords = ['date', 'time', 'datetime', 'timestamp', '日期', '时间']

    for col in df.columns:
        col_lower = str(col).lower()
        if any(keyword in col_lower for keyword in date_keywords):
            return col

    # 如果没有找到明显的日期列，尝试检测第一列是否为日期类型
    if len(df.columns) > 0:
        first_col = df.columns[0]
        try:
            pd.to_datetime(df[first_col])
            logger.info(f"自动识别第一列'{first_col}'为日期列")
            return first_col
        except:
            pass

    return None

def _load_multivariate_data(
    filenames: List[str],
    user_id: str,
    value_col: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_col: Optional[str] = None
) -> pd.DataFrame:
    """
    加载多变量数据并支持日期范围过滤

    ⚠️ 重要说明：
    - 支持中文文件名
    - 多个文件按行对齐（inner join），可能导致数据量减少
    - 返回的DataFrame列名使用文件名（去除.csv后缀）
    - 日期过滤会应用到所有文件

    Args:
        filenames: 多个数据文件名（支持中文）
        user_id: 用户ID
        value_col: 数据列名（所有文件必须使用相同的列名）
        start_date: 起始日期（可选）
        end_date: 结束日期（可选）
        date_col: 日期列名（可选）

    Returns:
        多变量DataFrame，每列为一个变量
    """
    from urllib.parse import unquote

    dfs = []
    for filename in filenames:
        series = _load_data(filename, user_id, value_col, start_date, end_date, date_col)
        col_name = filename.replace('.csv', '')
        dfs.append(pd.DataFrame({col_name: series.values}))

    merged = pd.concat(dfs, axis=1).dropna()
    return merged

def _run_residual_tests(residuals: List[float]) -> dict:
    """
    对模型残差运行诊断检验

    Args:
        residuals: 残差序列（可能包含None）

    Returns:
        检验结果字典
    """
    # 过滤None值和NaN值（兼容字符串类型）
    clean_residuals = []
    for r in residuals:
        if r is None:
            continue
        # 尝试转换为float
        try:
            val = float(r)
            if not np.isnan(val) and not np.isinf(val):
                clean_residuals.append(val)
        except (ValueError, TypeError):
            continue

    if len(clean_residuals) < 20:
        return {"error": "残差样本量不足，无法进行检验"}

    residual_series = pd.Series(clean_residuals)

    tests = {}

    # 1. ADF检验（残差平稳性）
    try:
        adf_result = adfuller(residual_series, autolag='AIC')
        tests['adf'] = {
            "test_statistic": float(adf_result[0]),
            "p_value": float(adf_result[1]),
            "used_lag": int(adf_result[2]),
            "is_stationary": bool(adf_result[1] < 0.05),
            "conclusion": "残差平稳" if adf_result[1] < 0.05 else "残差非平稳"
        }
    except Exception as e:
        tests['adf'] = {"error": str(e)}

    # 2. JB正态性检验
    try:
        jb_stat, jb_pval = jarque_bera(residual_series)
        tests['jb'] = {
            "test_statistic": float(jb_stat),
            "p_value": float(jb_pval),
            "is_normal": bool(jb_pval > 0.05),
            "n_observations": len(clean_residuals),
            "conclusion": "残差服从正态分布" if jb_pval > 0.05 else "残差不服从正态分布"
        }
    except Exception as e:
        tests['jb'] = {"error": str(e)}

    # 3. Ljung-Box自相关检验
    try:
        max_lags = min(20, len(clean_residuals) // 4)
        if max_lags < 1:
            max_lags = 1
        # 确保lags < 样本量（statsmodels要求）
        max_lags = min(max_lags, len(clean_residuals) - 1)
        lb_result = acorr_ljungbox(residual_series, lags=max_lags, return_df=True)
        # 使用最后一个滞后阶数的结果
        tests['ljung_box'] = {
            "test_statistic": float(lb_result['lb_stat'].iloc[-1]),
            "p_value": float(lb_result['lb_pvalue'].iloc[-1]),
            "selected_lag": max_lags,
            "has_autocorrelation": bool(lb_result['lb_pvalue'].iloc[-1] < 0.05),
            "conclusion": "残差存在自相关" if lb_result['lb_pvalue'].iloc[-1] < 0.05 else "残差无显著自相关"
        }
    except Exception as e:
        tests['ljung_box'] = {"error": str(e)}

    # 4. ARCH LM检验
    try:
        max_lags = min(10, len(clean_residuals) // 4)
        if max_lags < 1:
            max_lags = 1
        # 确保nlags < 样本量
        max_lags = min(max_lags, len(clean_residuals) - 1)
        arch_result = het_arch(residual_series, nlags=max_lags)
        tests['arch_lm'] = {
            "lm_statistic": float(arch_result[0]),
            "lm_p_value": float(arch_result[1]),
            "selected_lag": max_lags,
            "has_arch_effect": bool(arch_result[1] < 0.05),
            "conclusion": "残差存在ARCH效应" if arch_result[1] < 0.05 else "残差无ARCH效应"
        }
    except Exception as e:
        tests['arch_lm'] = {"error": str(e)}

    return tests

def _save_model_result(result: dict, model_type: str, user_id: str) -> tuple:
    """
    保存模型结果到report文件夹

    Returns:
        (report_id, model_json_path): 报告ID和模型JSON路径
    """
    import time
    timestamp = int(time.time())
    report_id = f"{model_type.lower()}_{timestamp}"

    # 创建报告文件夹: /root/librechat_user_data/{user_id}/reports/{report_id}/
    report_dir = f"/root/librechat_user_data/{user_id}/reports/{report_id}"
    os.makedirs(report_dir, exist_ok=True)

    # 保存模型结果JSON到报告文件夹
    model_json_path = os.path.join(report_dir, "model_result.json")
    with open(model_json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return report_id, model_json_path

# ===== API端点 =====

@router.post("/arima")
async def fit_arima(request: ARIMARequest):
    """拟合ARIMA模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(
            request.filename,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        order = tuple(request.order) if request.order else None

        service = ARIMAService()
        result = service.fit_arima(series, order=order)

        if result.get("success"):
            # 运行残差检验
            residuals = result.get("data", {}).get("residuals", [])
            if residuals:
                result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "arima", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            # 添加日期范围信息到结果
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"ARIMA API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arma")
async def fit_arma(request: ARIMARequest):
    """拟合ARMA模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(
            request.filename,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        order = (request.order[0], request.order[2]) if request.order else None

        service = ARIMAService()
        result = service.fit_arma(series, order=order)

        if result.get("success"):
            # 运行残差检验
            residuals = result.get("data", {}).get("residuals", [])
            if residuals:
                result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "arma", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"ARMA API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/garch")
async def fit_garch(request: GARCHRequest):
    """拟合GARCH模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(
            request.filename,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        garch_order = tuple(request.garch_order) if request.garch_order else None
        mean_order = tuple(request.mean_order) if request.mean_order else None

        service = GARCHService()
        result = service.fit_garch(
            series,
            garch_order=garch_order,
            mean_order=mean_order,
            distribution=request.distribution
        )

        if result.get("success"):
            # 运行残差检验
            residuals = result.get("data", {}).get("residuals", [])
            if residuals:
                result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "garch", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"GARCH API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arch")
async def fit_arch(request: GARCHRequest):
    """拟合ARCH模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(
            request.filename,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        arch_order = request.garch_order[0] if request.garch_order else None
        mean_order = tuple(request.mean_order) if request.mean_order else None

        service = GARCHService()
        result = service.fit_arch(
            series,
            arch_order=arch_order,
            mean_order=mean_order,
            distribution=request.distribution
        )

        if result.get("success"):
            # 运行残差检验
            residuals = result.get("data", {}).get("residuals", [])
            if residuals:
                result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "arch", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"ARCH API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/var")
async def fit_var(request: VARRequest):
    """拟合VAR模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        df = _load_multivariate_data(
            request.filenames,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        service = VARVECMService()
        result = service.fit_var(
            df,
            lags=request.lags,
            include_granger=request.include_granger,
            include_irf=request.include_irf
        )

        if result.get("success"):
            # 运行残差检验（使用第一个变量的残差）
            residuals_dict = result.get("data", {}).get("residuals", {})
            if residuals_dict and isinstance(residuals_dict, dict) and len(residuals_dict) > 0:
                first_var = list(residuals_dict.keys())[0]
                residuals = residuals_dict[first_var]
                if residuals:  # 确保残差列表不为空
                    result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "var", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"VAR API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vecm")
async def fit_vecm(request: VECMRequest):
    """拟合VECM模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        df = _load_multivariate_data(
            request.filenames,
            user_id,
            request.value_col,
            request.start_date,
            request.end_date,
            request.date_col
        )

        service = VARVECMService()
        result = service.fit_vecm(
            df,
            coint_rank=request.coint_rank,
            lags=request.lags,
            include_granger=request.include_granger,
            include_irf=request.include_irf
        )

        if result.get("success"):
            # 运行残差检验（使用第一个变量的残差）
            residuals_dict = result.get("data", {}).get("residuals", {})
            if residuals_dict and isinstance(residuals_dict, dict) and len(residuals_dict) > 0:
                first_var = list(residuals_dict.keys())[0]
                residuals = residuals_dict[first_var]
                if residuals:  # 确保残差列表不为空
                    result["residual_tests"] = _run_residual_tests(residuals)

            report_id, model_path = _save_model_result(result, "vecm", user_id)
            result["report_id"] = report_id
            result["model_json_path"] = model_path
            result["date_range"] = {
                "start_date": request.start_date,
                "end_date": request.end_date,
                "filtered": bool(request.start_date or request.end_date)
            }

        return result

    except Exception as e:
        logger.error(f"VECM API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

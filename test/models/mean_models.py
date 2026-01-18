"""ARIMA/ARMA模型测试 - 基于statsmodels"""

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import arma_order_select_ic, adfuller
import pandas as pd
import numpy as np
import warnings


def r2_score_manual(y_true, y_pred):
    """
    手动计算R²
    
    Args:
        y_true: 真实值
        y_pred: 预测值
        
    Returns:
        R²值
    """
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    if mask.sum() == 0:
        return 0.0
    y_t = y_true[mask]
    y_p = y_pred[mask]
    sst = ((y_t - y_t.mean())**2).sum()
    sse = ((y_t - y_p)**2).sum()
    if sst == 0:
        return 0.0
    return 1 - (sse/sst)


def calculate_metrics(y_true, y_pred, n_params, log_likelihood=None, aic=None, bic=None):
    """
    计算模型评估指标
    
    Args:
        y_true: 真实值
        y_pred: 预测值
        n_params: 参数数量
        log_likelihood: 对数似然（可选）
        aic: AIC值（可选）
        bic: BIC值（可选）
        
    Returns:
        包含R2、LogLik、AIC、BIC的字典
    """
    # 移除NaN对齐
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    y_t = y_true[mask]
    y_p = y_pred[mask]
    
    if len(y_t) == 0:
        return {"R2": None, "LogLik": None, "AIC": None, "BIC": None}

    r2 = r2_score_manual(y_t, y_p)
    
    # 计算残差
    residuals = y_t - y_p
    mse = np.mean(residuals**2)
    n = len(y_t)
    
    # 估计对数似然（高斯假设）
    if log_likelihood is None:
        log_likelihood = -n/2 * (np.log(2 * np.pi) + np.log(mse) + 1)
        
    # 计算AIC/BIC
    if aic is None:
        aic = 2 * n_params - 2 * log_likelihood
    if bic is None:
        bic = n_params * np.log(n) - 2 * log_likelihood
        
    return {
        "R2": float(r2),
        "LogLik": float(log_likelihood),
        "AIC": float(aic),
        "BIC": float(bic)
    }


def select_d_order(series, max_d=2):
    """
    使用ADF检验自动选择差分阶数d
    
    Args:
        series: 时间序列
        max_d: 最大差分阶数
        
    Returns:
        差分阶数d
    """
    for d in range(max_d + 1):
        if d == 0:
            test_series = series
        else:
            test_series = np.diff(series, n=d)
        
        test_series = test_series[~np.isnan(test_series)]
        
        if len(test_series) < 10:
            continue
            
        try:
            adf_result = adfuller(test_series, autolag='AIC')
            p_value = adf_result[1]
            
            if p_value < 0.05:
                return d
        except Exception:
            continue
    
    return 1


def select_arma_order(series, max_p=5, max_q=5):
    """
    使用AIC准则自动选择ARMA阶数
    
    Args:
        series: 时间序列
        max_p: 最大AR阶数
        max_q: 最大MA阶数
        
    Returns:
        (p, q) 最优阶数
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            
            result = arma_order_select_ic(
                series,
                max_ar=max_p,
                max_ma=max_q,
                ic='aic',
                trend='c'
            )
            
            return (int(result.aic_min_order[0]), int(result.aic_min_order[1]))
    
    except Exception:
        # 回退到网格搜索
        return grid_search_order(series, max_p, max_q)


def grid_search_order(series, max_p, max_q, d=0):
    """
    网格搜索最优阶数（备用方法）
    
    Args:
        series: 时间序列
        max_p: 最大AR阶数
        max_q: 最大MA阶数
        d: 差分阶数
        
    Returns:
        (p, q) 最优阶数
    """
    best_aic = float('inf')
    best_order = (1, 1)
    
    for p in range(0, max_p + 1):
        for q in range(0, max_q + 1):
            if p == 0 and q == 0:
                continue
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    model = ARIMA(series, order=(p, d, q))
                    result = model.fit()
                    
                    if result.aic < best_aic:
                        best_aic = result.aic
                        best_order = (p, q)
            except Exception:
                continue
    
    return best_order


def run_arima_type_model(df, order=None, model_type="ARIMA"):
    """
    统一的ARIMA/ARMA模型拟合函数
    
    Args:
        df: 包含unique_id, ds, y的DataFrame
        order: (p,d,q)手动指定阶数，None则自动选择
        model_type: "ARIMA" 或 "ARMA"
        
    Returns:
        模型结果字典
    """
    try:
        y_orig = df['y'].values
        y_orig = pd.to_numeric(pd.Series(y_orig), errors='coerce').dropna().values
        
        if len(y_orig) == 0:
            return {"error": "数据转换后无有效值"}
        
        # 选择阶数
        if order:
            p, d, q = order
            model_name = f"Manual {model_type}({p},{d},{q})"
        else:
            if model_type == "ARMA":
                # ARMA: d=0
                d = 0
                p, q = select_arma_order(y_orig)
                model_name = f"AutoARMA({p},{q})"
            else:
                # ARIMA: 自动选择d
                d = select_d_order(y_orig)
                diff_series = np.diff(y_orig, n=d) if d > 0 else y_orig
                p, q = select_arma_order(diff_series)
                model_name = f"AutoARIMA({p},{d},{q})"
        
        # 拟合模型
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = ARIMA(y_orig, order=(p, d, q))
            result = model.fit()
        
        # 提取结果
        fitted_values = result.fittedvalues
        residuals = result.resid
        
        # 对齐长度
        n_orig = len(y_orig)
        n_fitted = len(fitted_values)
        
        if n_fitted < n_orig:
            pad_len = n_orig - n_fitted
            full_fitted = [None] * pad_len + fitted_values.tolist()
            full_residuals = [None] * pad_len + residuals.tolist()
        else:
            full_fitted = fitted_values.tolist()
            full_residuals = residuals.tolist()
        
        # 清理NaN/Inf
        def clean_value(v):
            if v is None or np.isnan(v) or np.isinf(v):
                return None
            return float(v)
        
        full_fitted = [clean_value(v) for v in full_fitted]
        full_residuals = [clean_value(v) for v in full_residuals]
        
        # 提取参数和p值（兼容numpy数组）
        params = result.params
        pvalues = result.pvalues
        param_names = result.param_names if hasattr(result, 'param_names') else [f'param_{i}' for i in range(len(params))]
        
        coefficients = {}
        p_values = {}
        for i, name in enumerate(param_names):
            val = params[i] if isinstance(params, np.ndarray) else params.iloc[i]
            pval = pvalues[i] if isinstance(pvalues, np.ndarray) else pvalues.iloc[i]
            coefficients[name] = float(val) if not np.isnan(val) else None
            p_values[name] = float(pval) if not np.isnan(pval) else None
        
        # 计算指标
        metrics = calculate_metrics(
            y_orig,
            np.array([v if v is not None else np.nan for v in full_fitted], dtype=float),
            n_params=len(params),
            log_likelihood=result.llf,
            aic=result.aic,
            bic=result.bic
        )
        
        return {
            "model_name": model_name,
            "metrics": metrics,
            "parameters": {
                "coefficients": coefficients,
                "p_values": p_values,
                "sigma2": float(result.scale) if hasattr(result, 'scale') else None,
                "selected_order": (p, d, q)
            },
            "data": {
                "original": y_orig.tolist(),
                "fitted": full_fitted,
                "residuals": full_residuals
            }
        }

    except Exception as e:
        return {"error": f"{model_type} 拟合失败: {str(e)}"}


def run_arima(df, order=None):
    """
    运行ARIMA模型
    
    Args:
        df: 数据DataFrame
        order: (p,d,q)阶数
        
    Returns:
        模型结果
    """
    return run_arima_type_model(df, order, "ARIMA")


def run_arma(df, order=None):
    """
    运行ARMA模型
    
    Args:
        df: 数据DataFrame
        order: (p,q)阶数（转换为(p,0,q)）
        
    Returns:
        模型结果
    """
    try:
        y_orig = df['y'].values
        y_orig = pd.to_numeric(pd.Series(y_orig), errors='coerce').dropna().values
        
        if len(y_orig) == 0:
            return {"error": "数据转换后无有效值"}
        
        # ARMA 固定 d=0
        d = 0
        
        if order is not None:
            p, q = order
            model_name = f"Manual ARMA({p},{q})"
        else:
            # 自动选择 p, q（不做差分）
            p, q = select_arma_order(y_orig)
            model_name = f"AutoARMA({p},{q})"
        
        # 调用统一函数
        arima_order = (p, d, q)
        result = run_arima_type_model(df, order=arima_order, model_type="ARMA")
        
        if "error" not in result:
            result["model_name"] = model_name
        
        return result
        
    except Exception as e:
        return {"error": f"ARMA 拟合失败: {str(e)}"}


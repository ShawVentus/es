"""ARIMA/ARMA模型服务 - 基于statsmodels"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import arma_order_select_ic, adfuller
import warnings
import logging

logger = logging.getLogger(__name__)

class ARIMAService:
    """ARIMA/ARMA模型服务类（使用statsmodels）"""

    def __init__(self):
        # 搜索范围配置
        self.max_p = 5
        self.max_q = 5
        self.max_d = 2

    def _r2_score(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """
        计算R²
        
        Args:
            y_true: 真实值数组
            y_pred: 预测值数组
            
        Returns:
            R²值
        """
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

    def _select_d_order(self, series: np.ndarray) -> int:
        """
        使用ADF检验自动选择差分阶数d
        
        Args:
            series: 时间序列数据
            
        Returns:
            差分阶数d (0, 1, 或 2)
        """
        for d in range(self.max_d + 1):
            if d == 0:
                test_series = series
            else:
                test_series = np.diff(series, n=d)
            
            # 移除NaN
            test_series = test_series[~np.isnan(test_series)]
            
            if len(test_series) < 10:
                continue
                
            try:
                adf_result = adfuller(test_series, autolag='AIC')
                p_value = adf_result[1]
                
                # p < 0.05 表示平稳
                if p_value < 0.05:
                    return d
            except Exception:
                continue
        
        return 1  # 默认返回1阶差分

    def _select_arma_order(
        self, 
        series: np.ndarray, 
        max_p: int = 5, 
        max_q: int = 5
    ) -> Tuple[int, int]:
        """
        使用AIC准则自动选择ARMA阶数
        
        Args:
            series: 时间序列数据
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
        
        except Exception as e:
            logger.warning(f"自动选择ARMA阶数失败: {e}，使用网格搜索")
            return self._grid_search_order(series, max_p, max_q)

    def _grid_search_order(
        self, 
        series: np.ndarray, 
        max_p: int, 
        max_q: int,
        d: int = 0
    ) -> Tuple[int, int]:
        """
        网格搜索最优阶数（备用方法）
        
        Args:
            series: 时间序列数据
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

    def fit_arima(
        self,
        series: pd.Series,
        order: Optional[Tuple[int, int, int]] = None,
        timestamp_col: str = 'ds'
    ) -> Dict[str, Any]:
        """
        拟合ARIMA模型
        
        Args:
            series: 时间序列数据（pd.Series或pd.DataFrame）
            order: (p,d,q) 如果为None则自动选择
            timestamp_col: 时间戳列名（当series为DataFrame时使用）
            
        Returns:
            模型结果字典，包含：
            - success: 是否成功
            - model_name: 模型名称
            - model_type: 模型类型
            - selected_order: 选择的阶数
            - parameters: 模型参数（含p值）
            - metrics: 评估指标
            - data: 原始/拟合/残差数据
        """
        try:
            # 数据预处理
            if isinstance(series, pd.DataFrame):
                y_values = pd.to_numeric(series['y'], errors='coerce').dropna().values
            else:
                y_values = pd.to_numeric(series, errors='coerce').dropna().values
            
            if len(y_values) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}

            # 选择阶数
            if order is not None:
                p, d, q = order
                model_name = f"ARIMA({p},{d},{q})"
            else:
                # 自动选择d
                d = self._select_d_order(y_values)
                
                # 差分后选择p,q
                if d > 0:
                    diff_series = np.diff(y_values, n=d)
                else:
                    diff_series = y_values
                
                p, q = self._select_arma_order(diff_series, self.max_p, self.max_q)
                model_name = f"AutoARIMA({p},{d},{q})"
                logger.info(f"自动选择阶数: ARIMA({p},{d},{q})")

            # 拟合模型
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = ARIMA(y_values, order=(p, d, q))
                result = model.fit()

            # 提取结果
            fitted_values = result.fittedvalues
            residuals = result.resid
            
            # 对齐长度（差分导致前几行缺失）
            n_orig = len(y_values)
            n_fitted = len(fitted_values)
            
            if n_fitted < n_orig:
                pad_len = n_orig - n_fitted
                full_fitted = [None] * pad_len + fitted_values.tolist()
                full_residuals = [None] * pad_len + residuals.tolist()
            else:
                full_fitted = fitted_values.tolist()
                full_residuals = residuals.tolist()
            
            # 清理NaN/Inf为None（JSON兼容）
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

            # 提取标准误和t统计量
            bse = result.bse
            tvalues = result.tvalues
            standard_errors = {}
            t_statistics = {}
            for i, name in enumerate(param_names):
                se_val = bse[i] if isinstance(bse, np.ndarray) else bse.iloc[i]
                t_val = tvalues[i] if isinstance(tvalues, np.ndarray) else tvalues.iloc[i]
                standard_errors[name] = float(se_val) if not np.isnan(se_val) else None
                t_statistics[name] = float(t_val) if not np.isnan(t_val) else None

            # 计算R²
            valid_mask = [f is not None for f in full_fitted]
            y_valid = np.array([y_values[i] for i in range(n_orig) if valid_mask[i]])
            f_valid = np.array([full_fitted[i] for i in range(n_orig) if valid_mask[i]])
            r2 = self._r2_score(y_valid, f_valid)

            return {
                "success": True,
                "model_name": model_name,
                "model_type": "ARIMA",
                "selected_order": {
                    "p": int(p),
                    "d": int(d),
                    "q": int(q)
                },
                "parameters": {
                    "coefficients": coefficients,
                    "sigma2": float(result.scale) if hasattr(result, 'scale') else None,
                    "p_values": p_values,
                    "std_errors": standard_errors,
                    "t_values": t_statistics
                },
                "metrics": {
                    "r2": float(r2),
                    "log_likelihood": float(result.llf),
                    "aic": float(result.aic),
                    "bic": float(result.bic),
                    "mse": float(np.nanmean(np.array(full_residuals, dtype=float)**2)) if any(r is not None for r in full_residuals) else None,
                    "n_observations": int(result.nobs)
                },
                "data": {
                    "original": y_values.tolist(),
                    "fitted": full_fitted,
                    "residuals": full_residuals
                },
                "search_range": {
                    "max_p": self.max_p,
                    "max_q": self.max_q,
                    "max_d": self.max_d
                }
            }

        except Exception as e:
            logger.error(f"ARIMA拟合失败: {e}")
            return {"success": False, "error": str(e)}

    def fit_arma(
        self,
        series: pd.Series,
        order: Optional[Tuple[int, int]] = None
    ) -> Dict[str, Any]:
        """
        拟合ARMA模型（d=0的ARIMA）
        
        Args:
            series: 时间序列数据
            order: (p,q) 如果为None则自动选择
            
        Returns:
            模型结果字典
        """
        try:
            # 数据预处理
            if isinstance(series, pd.DataFrame):
                y_values = pd.to_numeric(series['y'], errors='coerce').dropna().values
            else:
                y_values = pd.to_numeric(series, errors='coerce').dropna().values
            
            if len(y_values) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}
            
            # ARMA 固定 d=0
            d = 0
            
            if order is not None:
                p, q = order
            else:
                # 自动选择 p, q（不做差分）
                p, q = self._select_arma_order(y_values, self.max_p, self.max_q)
                logger.info(f"自动选择阶数: ARMA({p},{q})")
            
            # 调用 fit_arima 进行拟合
            arima_order = (p, d, q)
            result = self.fit_arima(series, order=arima_order)
            
            if result.get("success"):
                result["model_type"] = "ARMA"
                if order is None:
                    result["model_name"] = f"AutoARMA({p},{q})"
                else:
                    result["model_name"] = f"ARMA({p},{q})"
            
            return result
            
        except Exception as e:
            logger.error(f"ARMA拟合失败: {e}")
            return {"success": False, "error": str(e)}


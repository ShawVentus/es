"""ARIMA/ARMA模型服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, ARIMA
import logging

logger = logging.getLogger(__name__)

class ARIMAService:
    """ARIMA/ARMA模型服务类"""

    def __init__(self):
        # 搜索范围配置
        self.max_p = 5
        self.max_q = 5
        self.max_d = 2

    def _r2_score(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """计算R²"""
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

    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        residuals: np.ndarray,
        n_params: int,
        log_likelihood: Optional[float] = None,
        aic: Optional[float] = None,
        bic: Optional[float] = None
    ) -> Dict[str, float]:
        """计算模型评估指标"""
        mask = ~np.isnan(y_true) & ~np.isnan(residuals)
        y_t = y_true[mask]
        res = residuals[mask]
        n = len(y_t)

        # R²
        y_fitted = y_t - res
        r2 = self._r2_score(y_t, y_fitted)

        # 残差MSE
        mse = np.mean(res**2)

        # Log-Likelihood（如果未提供）
        if log_likelihood is None:
            log_likelihood = -n/2 * (np.log(2 * np.pi) + np.log(mse) + 1)

        # AIC/BIC（如果未提供）
        if aic is None:
            aic = 2 * n_params - 2 * log_likelihood
        if bic is None:
            bic = n_params * np.log(n) - 2 * log_likelihood

        return {
            "r2": float(r2),
            "log_likelihood": float(log_likelihood),
            "aic": float(aic),
            "bic": float(bic),
            "mse": float(mse),
            "rmse": float(np.sqrt(mse)),
            "n_observations": int(n)
        }

    def fit_arima(
        self,
        series: pd.Series,
        order: Optional[Tuple[int, int, int]] = None,
        timestamp_col: str = 'ds'
    ) -> Dict[str, Any]:
        """
        拟合ARIMA模型

        Args:
            series: 时间序列数据
            order: (p,d,q) 如果为None则自动选择
            timestamp_col: 时间戳列名

        Returns:
            模型结果字典
        """
        try:
            # 准备StatsForecast格式
            if isinstance(series, pd.DataFrame):
                df = series.copy()
            else:
                df = pd.DataFrame({
                    'unique_id': 'series1',
                    'ds': pd.date_range('2000-01-01', periods=len(series), freq='D'),
                    'y': series.values
                })

            # 确保 y 列是数值类型
            df['y'] = pd.to_numeric(df['y'], errors='coerce')

            # 删除 NaN 值
            df = df.dropna(subset=['y'])

            if len(df) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}

            y_orig = df['y'].values

            # 选择模型
            if order is not None:
                # 手动模式
                model = ARIMA(order=order, season_length=1)
                model_name = f"ARIMA{order}"
                n_params = sum(order) + 2  # p + d + q + intercept + sigma
            else:
                # 自动模式（明确搜索范围）
                model = AutoARIMA(
                    season_length=1,
                    max_p=self.max_p,
                    max_q=self.max_q,
                    max_d=self.max_d,
                    d=None,  # 自动选择d
                    trace=False
                )
                model_name = "AutoARIMA"

            # 拟合
            sf = StatsForecast(models=[model], freq='D', n_jobs=1)
            sf.fit(df)

            # 提取结果
            fitted_model = sf.fitted_[0, 0].model_

            # 获取残差
            residuals = fitted_model.get('residuals')
            if residuals is None:
                return {"error": "模型未返回残差数据"}

            # 对齐长度（差分导致前几行为NaN）
            diff_len = len(y_orig) - len(residuals)
            full_residuals = [None] * diff_len + residuals.tolist()
            fitted_values = [None] * diff_len + (y_orig[diff_len:] - residuals).tolist()

            # 获取模型参数
            coef = fitted_model.get('coef', {})
            sigma2 = fitted_model.get('sigma2', 0)
            selected_order = fitted_model.get('order', order)

            # 计算指标
            aic = fitted_model.get('aic')
            bic = fitted_model.get('bic')
            loglik = fitted_model.get('loglik')

            n_params = len(coef) + 1  # 系数 + sigma

            metrics = self._calculate_metrics(
                y_orig,
                np.array([r if r is not None else np.nan for r in full_residuals]),
                n_params,
                log_likelihood=loglik,
                aic=aic,
                bic=bic
            )

            return {
                "success": True,
                "model_name": model_name,
                "model_type": "ARIMA",
                "selected_order": {
                    "p": int(selected_order[0]) if selected_order else None,
                    "d": int(selected_order[1]) if selected_order else None,
                    "q": int(selected_order[2]) if selected_order else None
                },
                "parameters": {
                    "coefficients": {k: float(v) for k, v in coef.items()},
                    "sigma2": float(sigma2)
                },
                "metrics": metrics,
                "data": {
                    "original": y_orig.tolist(),
                    "fitted": fitted_values,
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
        if order is not None:
            arima_order = (order[0], 0, order[1])
        else:
            arima_order = None

        result = self.fit_arima(series, order=arima_order)

        if result.get("success"):
            result["model_type"] = "ARMA"
            result["model_name"] = result["model_name"].replace("ARIMA", "ARMA")

        return result

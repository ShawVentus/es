"""统计检验服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional
from scipy.stats import jarque_bera
from statsmodels.tsa.stattools import adfuller
from statsmodels.stats.diagnostic import acorr_ljungbox, het_arch
import logging

logger = logging.getLogger(__name__)

class StatisticalTestsService:
    """统计检验服务类"""

    # ===== 单变量检验 =====

    def adf_test(self, series: pd.Series) -> Dict[str, Any]:
        """
        ADF单位根检验

        H0: 存在单位根（非平稳）
        H1: 不存在单位根（平稳）

        Args:
            series: 时间序列数据

        Returns:
            检验结果字典
        """
        try:
            clean_series = series.dropna()
            result = adfuller(clean_series, autolag='AIC')

            return {
                "test_name": "ADF单位根检验",
                "test_statistic": float(result[0]),
                "p_value": float(result[1]),
                "used_lag": int(result[2]),
                "n_observations": int(result[3]),
                "critical_values": {k: float(v) for k, v in result[4].items()},
                "is_stationary": bool(result[1] < 0.05),
                "conclusion": "序列平稳" if result[1] < 0.05 else "序列非平稳，建议进行差分处理",
                "h0": "序列存在单位根（非平稳）",
                "interpretation": f"p值={result[1]:.4f}，{'拒绝' if result[1] < 0.05 else '不能拒绝'}原假设"
            }
        except Exception as e:
            logger.error(f"ADF检验失败: {e}")
            return {"error": str(e)}

    def jarque_bera_test(self, series: pd.Series) -> Dict[str, Any]:
        """
        JB正态性检验

        H0: 数据服从正态分布
        H1: 数据不服从正态分布

        Args:
            series: 时间序列数据

        Returns:
            检验结果字典
        """
        try:
            clean_series = series.dropna()
            stat, p_value = jarque_bera(clean_series)

            return {
                "test_name": "Jarque-Bera正态性检验",
                "test_statistic": float(stat),
                "p_value": float(p_value),
                "n_observations": len(clean_series),
                "is_normal": bool(p_value > 0.05),
                "conclusion": "数据服从正态分布" if p_value > 0.05 else "数据不服从正态分布",
                "h0": "数据服从正态分布",
                "interpretation": f"p值={p_value:.4f}，{'不能拒绝' if p_value > 0.05 else '拒绝'}原假设"
            }
        except Exception as e:
            logger.error(f"JB检验失败: {e}")
            return {"error": str(e)}

    def ljung_box_auto(self, residuals: pd.Series, max_lags: int = 20) -> Dict[str, Any]:
        """
        Ljung-Box Q检验（自动选择滞后阶数）

        H0: 无自相关（白噪声）
        H1: 存在自相关

        Args:
            residuals: 残差序列
            max_lags: 最大滞后阶数

        Returns:
            检验结果字典（包含最优滞后阶数）
        """
        try:
            clean_residuals = residuals.dropna()
            n = len(clean_residuals)

            # 限制最大滞后阶数
            max_lags = min(max_lags, n // 4)

            # 遍历不同滞后阶数，计算AIC
            best_lag = 1
            best_aic = float('inf')

            results_by_lag = {}

            for lag in range(1, max_lags + 1):
                lb_result = acorr_ljungbox(clean_residuals, lags=[lag], return_df=True)
                stat = lb_result['lb_stat'].iloc[0]
                p_val = lb_result['lb_pvalue'].iloc[0]

                # 计算AIC（简化版，基于对数似然）
                # AIC = -2*log(L) + 2*k，这里k=lag
                log_likelihood = -0.5 * stat  # 简化假设
                aic = -2 * log_likelihood + 2 * lag

                results_by_lag[lag] = {
                    "stat": float(stat),
                    "p_value": float(p_val),
                    "aic": float(aic)
                }

                if aic < best_aic:
                    best_aic = aic
                    best_lag = lag

            # 使用最优滞后阶数的结果
            best_result = results_by_lag[best_lag]

            return {
                "test_name": "Ljung-Box Q检验（自动滞后）",
                "selected_lag": best_lag,
                "test_statistic": best_result["stat"],
                "p_value": best_result["p_value"],
                "aic": best_result["aic"],
                "n_observations": n,
                "has_autocorrelation": bool(best_result["p_value"] < 0.05),
                "conclusion": "存在自相关" if best_result["p_value"] < 0.05 else "无显著自相关（白噪声）",
                "h0": "数据无自相关",
                "interpretation": f"滞后{best_lag}阶，p值={best_result['p_value']:.4f}，{'拒绝' if best_result['p_value'] < 0.05 else '不能拒绝'}原假设",
                "all_lags_results": results_by_lag
            }
        except Exception as e:
            logger.error(f"Ljung-Box检验失败: {e}")
            return {"error": str(e)}

    def arch_lm_auto(self, residuals: pd.Series, max_lags: int = 20) -> Dict[str, Any]:
        """
        ARCH LM检验（自动选择滞后阶数）

        H0: 无ARCH效应（同方差）
        H1: 存在ARCH效应（异方差）

        Args:
            residuals: 残差序列
            max_lags: 最大滞后阶数

        Returns:
            检验结果字典（包含最优滞后阶数）
        """
        try:
            clean_residuals = residuals.dropna()
            n = len(clean_residuals)

            # 限制最大滞后阶数
            max_lags = min(max_lags, n // 4)

            best_lag = 1
            best_aic = float('inf')
            results_by_lag = {}

            for lag in range(1, max_lags + 1):
                # het_arch返回 (lm_stat, lm_pvalue, f_stat, f_pvalue)
                result = het_arch(clean_residuals, nlags=lag)
                lm_stat = result[0]
                lm_pvalue = result[1]
                f_stat = result[2]
                f_pvalue = result[3]

                # 计算AIC
                log_likelihood = -0.5 * lm_stat
                aic = -2 * log_likelihood + 2 * lag

                results_by_lag[lag] = {
                    "lm_stat": float(lm_stat),
                    "lm_pvalue": float(lm_pvalue),
                    "f_stat": float(f_stat),
                    "f_pvalue": float(f_pvalue),
                    "aic": float(aic)
                }

                if aic < best_aic:
                    best_aic = aic
                    best_lag = lag

            best_result = results_by_lag[best_lag]

            return {
                "test_name": "ARCH LM检验（自动滞后）",
                "selected_lag": best_lag,
                "lm_statistic": best_result["lm_stat"],
                "lm_p_value": best_result["lm_pvalue"],
                "f_statistic": best_result["f_stat"],
                "f_p_value": best_result["f_pvalue"],
                "aic": best_result["aic"],
                "n_observations": n,
                "has_arch_effect": bool(best_result["lm_pvalue"] < 0.05),
                "conclusion": "存在ARCH效应（建议使用GARCH模型）" if best_result["lm_pvalue"] < 0.05 else "无显著ARCH效应",
                "h0": "无条件异方差性",
                "interpretation": f"滞后{best_lag}阶，p值={best_result['lm_pvalue']:.4f}，{'拒绝' if best_result['lm_pvalue'] < 0.05 else '不能拒绝'}原假设",
                "all_lags_results": results_by_lag
            }
        except Exception as e:
            logger.error(f"ARCH LM检验失败: {e}")
            return {"error": str(e)}

    def run_all_univariate_tests(self, series: pd.Series) -> Dict[str, Any]:
        """
        运行所有单变量检验

        Args:
            series: 时间序列数据

        Returns:
            所有检验结果的字典
        """
        return {
            "adf": self.adf_test(series),
            "jb": self.jarque_bera_test(series),
            "ljung_box": self.ljung_box_auto(series),
            "arch_lm": self.arch_lm_auto(series)
        }

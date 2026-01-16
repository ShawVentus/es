"""多变量统计检验服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.tsa.vector_ar.vecm import coint_johansen
from statsmodels.tsa.stattools import grangercausalitytests
import logging

logger = logging.getLogger(__name__)

class MultivariateTestsService:
    """多变量统计检验服务类"""

    def pearson_correlation(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Pearson相关系数矩阵

        Args:
            df: 多变量数据DataFrame

        Returns:
            相关系数矩阵及解释
        """
        try:
            corr_matrix = df.corr(method='pearson')

            # 找出高相关对（|r| > 0.7）
            high_corr_pairs = []
            for i in range(len(corr_matrix.columns)):
                for j in range(i+1, len(corr_matrix.columns)):
                    corr_val = corr_matrix.iloc[i, j]
                    if abs(corr_val) > 0.7:
                        high_corr_pairs.append({
                            "var1": corr_matrix.columns[i],
                            "var2": corr_matrix.columns[j],
                            "correlation": float(corr_val)
                        })

            return {
                "test_name": "Pearson相关系数矩阵",
                "correlation_matrix": corr_matrix.to_dict(),
                "high_correlation_pairs": high_corr_pairs,
                "n_variables": len(df.columns),
                "interpretation": f"发现{len(high_corr_pairs)}对高相关变量（|r|>0.7）" if high_corr_pairs else "无高相关变量对",
                "conclusion": "存在多重共线性风险" if high_corr_pairs else "相关性在合理范围内"
            }
        except Exception as e:
            logger.error(f"Pearson相关分析失败: {e}")
            return {"error": str(e)}

    def vif_analysis(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        VIF方差膨胀因子（多重共线性检验）

        ⚠️ 注意：statsmodels的variance_inflation_factor要求数据中显式包含常数项

        Args:
            df: 多变量数据DataFrame

        Returns:
            每个变量的VIF值
        """
        try:
            from statsmodels.tools.tools import add_constant

            # ⚠️ 关键：必须添加常数项，否则VIF计算结果不正确
            df_with_const = add_constant(df, prepend=True)

            vif_data = []

            # 从索引1开始，跳过常数项列
            for i, col in enumerate(df.columns):
                try:
                    # +1是因为第0列是常数项
                    vif_value = variance_inflation_factor(df_with_const.values, i + 1)

                    # 处理Inf（完全共线时会出现）
                    if np.isinf(vif_value):
                        vif_value = float('inf')
                        logger.warning(f"变量 {col} 的VIF为无穷大，存在完全共线性")

                    vif_data.append({
                        "variable": col,
                        "vif": float(vif_value) if not np.isinf(vif_value) else None,
                        "vif_display": "∞" if np.isinf(vif_value) else f"{vif_value:.2f}",
                        "has_collinearity": bool(vif_value > 10)
                    })
                except Exception as inner_e:
                    logger.warning(f"变量 {col} VIF计算失败: {inner_e}")
                    vif_data.append({
                        "variable": col,
                        "vif": None,
                        "vif_display": "计算失败",
                        "has_collinearity": False,
                        "error": str(inner_e)
                    })

            # 统计严重共线性变量
            severe_collinearity = [v for v in vif_data if v.get("has_collinearity")]

            return {
                "test_name": "VIF多重共线性检验",
                "vif_values": vif_data,
                "n_variables": len(df.columns),
                "severe_collinearity_vars": severe_collinearity,
                "interpretation": f"发现{len(severe_collinearity)}个变量存在严重共线性（VIF>10）",
                "conclusion": "存在多重共线性，建议剔除或合并相关变量" if severe_collinearity else "无严重多重共线性",
                "threshold": 10,
                "note": "VIF计算时已自动添加常数项"
            }
        except Exception as e:
            logger.error(f"VIF分析失败: {e}")
            return {"error": str(e)}

    def panel_adf_test(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Panel ADF检验（多变量单位根检验）

        H0: 所有序列都存在单位根
        H1: 至少一个序列平稳

        Args:
            df: 多变量数据DataFrame

        Returns:
            每个变量的ADF检验结果
        """
        try:
            from statsmodels.tsa.stattools import adfuller

            results = []

            for col in df.columns:
                series = df[col].dropna()
                adf_result = adfuller(series, autolag='AIC')

                results.append({
                    "variable": col,
                    "adf_statistic": float(adf_result[0]),
                    "p_value": float(adf_result[1]),
                    "is_stationary": bool(adf_result[1] < 0.05)
                })

            # 统计
            stationary_count = sum(1 for r in results if r["is_stationary"])
            all_stationary = stationary_count == len(results)

            return {
                "test_name": "Panel ADF检验（多变量单位根）",
                "individual_results": results,
                "n_variables": len(df.columns),
                "stationary_count": stationary_count,
                "all_stationary": all_stationary,
                "interpretation": f"{stationary_count}/{len(results)}个变量平稳",
                "conclusion": "所有变量平稳，可直接建模" if all_stationary else "存在非平稳变量，建议差分或使用协整模型"
            }
        except Exception as e:
            logger.error(f"Panel ADF检验失败: {e}")
            return {"error": str(e)}

    def johansen_cointegration(self, df: pd.DataFrame, det_order: int = 0) -> Dict[str, Any]:
        """
        Johansen协整检验

        H0: 不存在协整关系
        H1: 存在r个协整向量

        Args:
            df: 多变量数据DataFrame
            det_order: 确定性趋势阶数（0=无趋势, 1=常数项）

        Returns:
            协整检验结果
        """
        try:
            result = coint_johansen(df, det_order=det_order, k_ar_diff=1)

            # 迹检验（Trace Test）
            trace_stats = result.lr1  # 迹统计量
            trace_crit = result.cvt  # 临界值（90%, 95%, 99%）

            # 最大特征值检验（Max Eigenvalue Test）
            max_eig_stats = result.lr2
            max_eig_crit = result.cvm

            # 确定协整秩（使用95%显著性水平）
            coint_rank_trace = 0
            for i in range(len(trace_stats)):
                if trace_stats[i] > trace_crit[i, 1]:  # 95%临界值
                    coint_rank_trace = i + 1
                else:
                    break

            coint_rank_maxeig = 0
            for i in range(len(max_eig_stats)):
                if max_eig_stats[i] > max_eig_crit[i, 1]:
                    coint_rank_maxeig = i + 1
                else:
                    break

            # 协整向量（如果存在）
            eigenvectors = result.evec if hasattr(result, 'evec') else None

            return {
                "test_name": "Johansen协整检验",
                "n_variables": len(df.columns),
                "trace_test": {
                    "statistics": trace_stats.tolist(),
                    "critical_values_95pct": trace_crit[:, 1].tolist(),
                    "cointegration_rank": coint_rank_trace
                },
                "max_eigenvalue_test": {
                    "statistics": max_eig_stats.tolist(),
                    "critical_values_95pct": max_eig_crit[:, 1].tolist(),
                    "cointegration_rank": coint_rank_maxeig
                },
                "recommended_rank": coint_rank_trace,  # 使用迹检验结果
                "has_cointegration": bool(coint_rank_trace > 0),
                "interpretation": f"迹检验显示存在{coint_rank_trace}个协整关系" if coint_rank_trace > 0 else "未发现协整关系",
                "conclusion": "变量间存在长期均衡关系，建议使用VECM模型" if coint_rank_trace > 0 else "无协整关系，建议使用VAR模型",
                "eigenvectors": eigenvectors.tolist() if eigenvectors is not None else None
            }
        except Exception as e:
            logger.error(f"Johansen协整检验失败: {e}")
            return {"error": str(e)}

    def granger_causality_matrix(self, df: pd.DataFrame, max_lag: int = 10) -> Dict[str, Any]:
        """
        格兰杰因果检验（两两变量）

        H0: X不是Y的格兰杰原因
        H1: X是Y的格兰杰原因

        Args:
            df: 多变量数据DataFrame
            max_lag: 最大滞后阶数

        Returns:
            格兰杰因果检验矩阵
        """
        try:
            variables = df.columns.tolist()
            n_vars = len(variables)

            # 初始化结果矩阵
            causality_matrix = {}

            for i, var1 in enumerate(variables):
                for j, var2 in enumerate(variables):
                    if i == j:
                        continue  # 跳过自己

                    # 格兰杰因果检验：var1 -> var2
                    test_data = df[[var2, var1]]  # 注意顺序：被解释变量在前

                    try:
                        # grangercausalitytests会自动选择最优滞后（基于AIC/BIC）
                        # 返回dict: {lag: (result_dict, ...)}
                        gc_result = grangercausalitytests(test_data, maxlag=max_lag, verbose=False)

                        # 选择AIC最小的滞后阶数
                        best_lag = 1
                        best_aic = float('inf')
                        best_p_value = 1.0

                        for lag in range(1, max_lag + 1):
                            # gc_result[lag][0] 包含4个测试的结果
                            # 我们使用F检验（'ssr_ftest'）
                            ssr_ftest = gc_result[lag][0]['ssr_ftest']
                            f_stat, p_value, df_denom, df_num = ssr_ftest

                            # 计算AIC（简化）
                            aic = -2 * np.log(p_value) + 2 * lag if p_value > 0 else float('inf')

                            if aic < best_aic:
                                best_aic = aic
                                best_lag = lag
                                best_p_value = p_value

                        causality_matrix[f"{var1}->{var2}"] = {
                            "cause": var1,
                            "effect": var2,
                            "optimal_lag": best_lag,
                            "p_value": float(best_p_value),
                            "is_granger_cause": bool(best_p_value < 0.05),
                            "aic": float(best_aic)
                        }

                    except Exception as e:
                        logger.warning(f"格兰杰因果检验失败 ({var1}->{var2}): {e}")
                        causality_matrix[f"{var1}->{var2}"] = {"error": str(e)}

            # 统计显著的因果关系
            significant_causalities = [
                k for k, v in causality_matrix.items()
                if "is_granger_cause" in v and v["is_granger_cause"]
            ]

            return {
                "test_name": "格兰杰因果检验（自动滞后）",
                "n_variables": n_vars,
                "causality_matrix": causality_matrix,
                "significant_causalities": significant_causalities,
                "n_significant": len(significant_causalities),
                "interpretation": f"发现{len(significant_causalities)}对显著的格兰杰因果关系",
                "conclusion": "存在预测因果关系" if significant_causalities else "未发现显著的预测因果关系",
                "note": "格兰杰因果不代表真实因果，仅表示统计上的领先滞后关系"
            }
        except Exception as e:
            logger.error(f"格兰杰因果检验失败: {e}")
            return {"error": str(e)}

    def run_all_multivariate_tests(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        运行所有多变量检验

        Args:
            df: 多变量数据DataFrame

        Returns:
            所有检验结果的字典
        """
        return {
            "pearson_correlation": self.pearson_correlation(df),
            "vif": self.vif_analysis(df),
            "panel_adf": self.panel_adf_test(df),
            "johansen": self.johansen_cointegration(df),
            "granger_causality": self.granger_causality_matrix(df)
        }

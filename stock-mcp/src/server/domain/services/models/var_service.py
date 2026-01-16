"""VAR/VECM模型服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List
from statsmodels.tsa.api import VAR
from statsmodels.tsa.vector_ar.vecm import VECM, select_coint_rank
from statsmodels.tsa.stattools import grangercausalitytests
import logging

logger = logging.getLogger(__name__)

class VARVECMService:
    """VAR/VECM模型服务类"""

    def __init__(self):
        # 脉冲响应配置
        self.irf_periods = 10  # 默认10期
        self.bootstrap_reps = 500  # Bootstrap重复次数
        self.confidence_level = 0.95  # 95%置信区间

        # 格兰杰因果配置
        self.max_lag_granger = 10  # 最大滞后阶数

    def _select_granger_lag_by_aic(
        self,
        data_pair: pd.DataFrame,
        max_lag: int = 10
    ) -> int:
        """
        使用AIC准则选择格兰杰因果检验的最优滞后阶数

        原理：对每个滞后阶数k，拟合VAR(k)模型，选择AIC最小的k

        Args:
            data_pair: 两变量数据 (y变量在前, x变量在后)
            max_lag: 最大滞后阶数

        Returns:
            最优滞后阶数
        """
        from statsmodels.tsa.api import VAR

        try:
            model = VAR(data_pair)
            # select_order返回各阶数的信息准则值
            lag_order_result = model.select_order(maxlags=max_lag)

            # 优先使用AIC，也可以用BIC
            best_lag_aic = lag_order_result.aic

            # 确保至少为1
            if best_lag_aic < 1:
                best_lag_aic = 1

            return best_lag_aic

        except Exception as e:
            logger.warning(f"AIC选择滞后阶数失败: {e}，使用默认值1")
            return 1

    def _granger_causality_test(
        self,
        df: pd.DataFrame,
        max_lag: int = 10
    ) -> Dict[str, Any]:
        """
        格兰杰因果检验（两两变量，基于AIC/BIC自动选择滞后阶数）

        ⚠️ 重要改动：滞后阶数选择基于VAR模型的AIC准则，而非简单的min(p-value)

        Args:
            df: 多变量数据
            max_lag: 最大滞后阶数

        Returns:
            因果检验结果矩阵
        """
        variables = df.columns.tolist()
        causality_matrix = {}

        for var1 in variables:
            for var2 in variables:
                if var1 == var2:
                    continue

                try:
                    # 格兰杰因果检验数据格式：被解释变量在前，解释变量在后
                    # 检验 var1 -> var2，即var1是否是var2的格兰杰原因
                    test_data = df[[var2, var1]]

                    # Step 1: 使用AIC准则选择最优滞后阶数
                    optimal_lag = self._select_granger_lag_by_aic(test_data, max_lag)

                    # Step 2: 在最优滞后阶数下执行格兰杰因果检验
                    gc_result = grangercausalitytests(test_data, maxlag=[optimal_lag], verbose=False)

                    # 提取F检验结果（更常用于学术报告）
                    ssr_ftest = gc_result[optimal_lag][0]['ssr_ftest']
                    f_stat = ssr_ftest[0]
                    p_value = ssr_ftest[1]
                    df_denom = ssr_ftest[2]
                    df_num = ssr_ftest[3]

                    # 提取卡方检验结果（备用）
                    ssr_chi2test = gc_result[optimal_lag][0]['ssr_chi2test']
                    chi2_stat = ssr_chi2test[0]
                    chi2_p = ssr_chi2test[1]

                    causality_matrix[f"{var1}->{var2}"] = {
                        "cause": var1,
                        "effect": var2,
                        "optimal_lag": optimal_lag,
                        "lag_selection_method": "AIC",  # 明确说明选择方法
                        "f_statistic": float(f_stat),
                        "p_value": float(p_value),
                        "df_num": int(df_num),
                        "df_denom": int(df_denom),
                        "chi2_statistic": float(chi2_stat),
                        "chi2_p_value": float(chi2_p),
                        "is_significant": bool(p_value < 0.05),
                        "conclusion": f"{var1}是{var2}的格兰杰原因" if p_value < 0.05 else f"{var1}不是{var2}的格兰杰原因"
                    }

                except Exception as e:
                    logger.warning(f"格兰杰因果检验失败 ({var1}->{var2}): {e}")
                    causality_matrix[f"{var1}->{var2}"] = {"error": str(e)}

        return causality_matrix

    def _impulse_response_analysis(
        self,
        var_result,
        periods: int = 10,
        bootstrap_reps: int = 500
    ) -> Dict[str, Any]:
        """
        脉冲响应分析（带Bootstrap置信区间）

        Args:
            var_result: VAR拟合结果
            periods: 响应期数
            bootstrap_reps: Bootstrap重复次数

        Returns:
            脉冲响应函数及置信区间
        """
        try:
            # 计算脉冲响应
            irf = var_result.irf(periods)

            # Bootstrap置信区间（95%）
            irf_err = irf.err_band_mc(repl=bootstrap_reps, signif=0.05, seed=123)

            # 提取数据
            irf_data = {}
            variables = var_result.names

            for i, shock_var in enumerate(variables):
                irf_data[shock_var] = {}
                for j, response_var in enumerate(variables):
                    # 脉冲响应值
                    response = irf.irfs[:, j, i].tolist()

                    # 置信区间（如果计算成功）
                    try:
                        lower = irf_err[0][:, j, i].tolist()
                        upper = irf_err[1][:, j, i].tolist()
                    except:
                        lower = None
                        upper = None

                    irf_data[shock_var][response_var] = {
                        "response": response,
                        "ci_lower": lower,
                        "ci_upper": upper
                    }

            return {
                "success": True,
                "periods": periods,
                "bootstrap_reps": bootstrap_reps,
                "confidence_level": 0.95,
                "irf_data": irf_data
            }

        except Exception as e:
            logger.error(f"脉冲响应分析失败: {e}")
            return {"success": False, "error": str(e)}

    def _variance_decomposition(
        self,
        var_result,
        periods: int = 10
    ) -> Dict[str, Any]:
        """
        方差分解

        Args:
            var_result: VAR拟合结果
            periods: 预测期数

        Returns:
            方差分解结果
        """
        try:
            fevd = var_result.fevd(periods)

            decomp_data = {}
            for i, var in enumerate(var_result.names):
                decomp_data[var] = fevd.decomp[i].tolist()

            return {
                "success": True,
                "periods": periods,
                "decomposition": decomp_data,
                "variables": var_result.names
            }

        except Exception as e:
            logger.error(f"方差分解失败: {e}")
            return {"success": False, "error": str(e)}

    def _vecm_bootstrap_irf(
        self,
        df: pd.DataFrame,
        vecm_result,
        coint_rank: int,
        k_ar_diff: int,
        periods: int = 10,
        bootstrap_reps: int = 500
    ) -> Dict[str, Any]:
        """
        VECM模型的Bootstrap脉冲响应分析

        ⚠️ 重要：statsmodels的VECM不直接支持Bootstrap IRF
        因此通过手动残差重采样实现

        原理：
        1. 获取VECM拟合的残差
        2. Bootstrap循环：重采样残差 → 重构数据 → 重新估计VECM → 计算IRF
        3. 取各次IRF的2.5%和97.5%分位数作为95%置信区间

        Args:
            df: 原始数据
            vecm_result: VECM拟合结果
            coint_rank: 协整秩
            k_ar_diff: 差分滞后阶数
            periods: 响应期数
            bootstrap_reps: Bootstrap重复次数

        Returns:
            包含置信区间的脉冲响应结果
        """
        try:
            n_vars = len(df.columns)
            variables = df.columns.tolist()

            # 获取原始IRF
            original_irf = vecm_result.irf(periods=periods)
            original_irfs = original_irf.irfs  # shape: (periods+1, n_vars, n_vars)

            # 获取残差
            residuals = vecm_result.resid.values  # shape: (T, n_vars)
            T = len(residuals)

            # 存储所有Bootstrap IRF
            bootstrap_irfs = []

            for rep in range(bootstrap_reps):
                try:
                    # Step 1: 重采样残差（有放回抽样）
                    resampled_indices = np.random.choice(T, size=T, replace=True)
                    resampled_residuals = residuals[resampled_indices]

                    # Step 2: 基于重采样残差重构数据
                    # 使用VECM的fitted values + 重采样残差
                    fitted_values = vecm_result.fittedvalues.values
                    reconstructed_data = fitted_values + resampled_residuals

                    # 添加初始值（被差分掉的部分）
                    start_idx = len(df) - len(reconstructed_data)
                    initial_values = df.values[:start_idx]
                    full_data = np.vstack([initial_values, reconstructed_data])

                    # Step 3: 重新估计VECM
                    bootstrap_df = pd.DataFrame(full_data, columns=df.columns)
                    bootstrap_vecm = VECM(
                        bootstrap_df,
                        k_ar_diff=k_ar_diff,
                        coint_rank=coint_rank,
                        deterministic="ci"
                    )
                    bootstrap_result = bootstrap_vecm.fit()

                    # Step 4: 计算IRF
                    bootstrap_irf_obj = bootstrap_result.irf(periods=periods)
                    bootstrap_irfs.append(bootstrap_irf_obj.irfs)

                except Exception as e:
                    # 单次Bootstrap失败，跳过
                    logger.debug(f"Bootstrap迭代{rep}失败: {e}")
                    continue

            if len(bootstrap_irfs) < 100:
                logger.warning(f"Bootstrap成功次数不足: {len(bootstrap_irfs)}/{bootstrap_reps}")
                return {
                    "success": False,
                    "error": f"Bootstrap成功次数不足({len(bootstrap_irfs)}次)，无法计算可靠的置信区间"
                }

            # Step 5: 计算置信区间（2.5%和97.5%分位数）
            bootstrap_irfs = np.array(bootstrap_irfs)  # shape: (n_success, periods+1, n_vars, n_vars)

            ci_lower = np.percentile(bootstrap_irfs, 2.5, axis=0)
            ci_upper = np.percentile(bootstrap_irfs, 97.5, axis=0)

            # 构建输出
            irf_data = {}
            for i, shock_var in enumerate(variables):
                irf_data[shock_var] = {}
                for j, response_var in enumerate(variables):
                    irf_data[shock_var][response_var] = {
                        "response": original_irfs[:, j, i].tolist(),
                        "ci_lower": ci_lower[:, j, i].tolist(),
                        "ci_upper": ci_upper[:, j, i].tolist()
                    }

            return {
                "success": True,
                "periods": periods,
                "bootstrap_reps": bootstrap_reps,
                "successful_reps": len(bootstrap_irfs),
                "confidence_level": 0.95,
                "irf_data": irf_data,
                "method": "residual_bootstrap"  # 明确说明使用的方法
            }

        except Exception as e:
            logger.error(f"VECM Bootstrap脉冲响应失败: {e}")
            return {"success": False, "error": str(e)}

    def fit_var(
        self,
        df: pd.DataFrame,
        lags: Optional[int] = None,
        include_granger: bool = True,
        include_irf: bool = True
    ) -> Dict[str, Any]:
        """
        拟合VAR模型

        Args:
            df: 多变量数据DataFrame
            lags: 滞后阶数，None为自动选择(AIC)
            include_granger: 是否包含格兰杰因果检验
            include_irf: 是否包含脉冲响应分析

        Returns:
            模型结果字典
        """
        try:
            # 确保所有列都是数值类型
            df_numeric = df.apply(pd.to_numeric, errors='coerce')
            df_clean = df_numeric.dropna()

            if len(df_clean) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}

            model = VAR(df_clean)

            # 选择滞后阶数
            if lags is None:
                lag_order = model.select_order(maxlags=10)
                selected_lag = lag_order.aic
                logger.info(f"VAR自动选择滞后阶数: {selected_lag}")
            else:
                selected_lag = lags

            # 拟合模型
            result = model.fit(selected_lag)

            # 系统指标
            metrics = {
                "log_likelihood": float(result.llf),
                "aic": float(result.aic),
                "bic": float(result.bic),
                "n_observations": len(df_clean) - selected_lag
            }

            # R²（每个方程）
            r2_by_eq = {}
            resid_df = result.resid
            for col in df_clean.columns:
                y_true = df_clean[col].iloc[selected_lag:].values
                residuals = resid_df[col].values
                y_fitted = y_true - residuals
                sst = ((y_true - y_true.mean())**2).sum()
                sse = (residuals**2).sum()
                r2_by_eq[col] = float(1 - sse/sst) if sst > 0 else 0

            metrics["r2_by_equation"] = r2_by_eq
            metrics["r2_average"] = float(np.mean(list(r2_by_eq.values())))

            # 准备数据
            fitted_data = {}
            resid_data = {}
            for col in df_clean.columns:
                fitted_col = [None] * selected_lag + result.fittedvalues[col].tolist()
                resid_col = [None] * selected_lag + result.resid[col].tolist()
                fitted_data[col] = fitted_col
                resid_data[col] = resid_col

            # 结果字典
            model_result = {
                "success": True,
                "model_name": f"VAR({selected_lag})",
                "model_type": "VAR",
                "selected_lag": selected_lag,
                "variables": df_clean.columns.tolist(),
                "n_variables": len(df_clean.columns),
                "parameters": {
                    col: result.params[col].to_dict()
                    for col in result.params.columns
                },
                "metrics": metrics,
                "data": {
                    "original": df_clean.to_dict(orient='list'),
                    "fitted": fitted_data,
                    "residuals": resid_data
                }
            }

            # 格兰杰因果检验
            if include_granger:
                granger_result = self._granger_causality_test(df_clean, self.max_lag_granger)
                model_result["granger_causality"] = granger_result

                # 统计显著的因果关系
                significant = [k for k, v in granger_result.items()
                              if v.get("is_significant", False)]
                model_result["significant_causalities"] = significant

            # 脉冲响应分析
            if include_irf:
                irf_result = self._impulse_response_analysis(
                    result,
                    periods=self.irf_periods,
                    bootstrap_reps=self.bootstrap_reps
                )
                model_result["impulse_response"] = irf_result

                # 方差分解
                fevd_result = self._variance_decomposition(result, periods=self.irf_periods)
                model_result["variance_decomposition"] = fevd_result

            return model_result

        except Exception as e:
            logger.error(f"VAR拟合失败: {e}")
            return {"success": False, "error": str(e)}

    def fit_vecm(
        self,
        df: pd.DataFrame,
        coint_rank: Optional[int] = None,
        lags: int = 1,
        include_granger: bool = True,
        include_irf: bool = True
    ) -> Dict[str, Any]:
        """
        拟合VECM模型

        Args:
            df: 多变量数据DataFrame
            coint_rank: 协整秩，None为自动选择(Johansen检验)
            lags: 差分滞后阶数
            include_granger: 是否包含格兰杰因果检验
            include_irf: 是否包含脉冲响应分析

        Returns:
            模型结果字典
        """
        try:
            # 确保所有列都是数值类型
            df_numeric = df.apply(pd.to_numeric, errors='coerce')
            df_clean = df_numeric.dropna()

            if len(df_clean) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}

            # 自动选择协整秩
            if coint_rank is None:
                rank_test = select_coint_rank(
                    df_clean,
                    det_order=0,
                    k_ar_diff=lags,
                    method="trace",
                    signif=0.05
                )
                selected_rank = rank_test.rank
                logger.info(f"VECM自动选择协整秩: {selected_rank}")
            else:
                selected_rank = coint_rank

            # 拟合模型
            model = VECM(df_clean, k_ar_diff=lags, coint_rank=selected_rank, deterministic="ci")
            result = model.fit()

            # 系统指标
            try:
                metrics = {
                    "log_likelihood": float(result.llf) if hasattr(result, 'llf') else None,
                    "aic": float(result.aic) if hasattr(result, 'aic') else None,
                    "bic": float(result.bic) if hasattr(result, 'bic') else None
                }
            except:
                metrics = {}

            # R²计算
            resid_df = result.resid
            valid_len = len(resid_df)
            start_idx = len(df_clean) - valid_len

            r2_by_eq = {}
            for col in df_clean.columns:
                y_true = df_clean[col].iloc[start_idx:].values
                residuals = resid_df[col].values
                sst = ((y_true - y_true.mean())**2).sum()
                sse = (residuals**2).sum()
                r2_by_eq[col] = float(1 - sse/sst) if sst > 0 else 0

            metrics["r2_by_equation"] = r2_by_eq
            metrics["r2_average"] = float(np.mean(list(r2_by_eq.values())))
            metrics["n_observations"] = valid_len

            # 准备数据
            fitted_data = {}
            resid_data = {}
            for col in df_clean.columns:
                fitted_col = [None] * start_idx + result.fittedvalues[col].tolist()
                resid_col = [None] * start_idx + result.resid[col].tolist()
                fitted_data[col] = fitted_col
                resid_data[col] = resid_col

            # 结果字典
            model_result = {
                "success": True,
                "model_name": f"VECM(rank={selected_rank}, lags={lags})",
                "model_type": "VECM",
                "cointegration_rank": selected_rank,
                "lags": lags,
                "variables": df_clean.columns.tolist(),
                "n_variables": len(df_clean.columns),
                "parameters": {
                    "alpha": result.alpha.tolist(),  # 调整系数
                    "beta": result.beta.tolist(),    # 协整向量
                    "gamma": result.gamma.tolist()   # 短期动态系数
                },
                "metrics": metrics,
                "data": {
                    "original": df_clean.to_dict(orient='list'),
                    "fitted": fitted_data,
                    "residuals": resid_data
                }
            }

            # 格兰杰因果检验
            if include_granger:
                granger_result = self._granger_causality_test(df_clean, self.max_lag_granger)
                model_result["granger_causality"] = granger_result

            # 脉冲响应（VECM使用Bootstrap方法计算置信区间）
            if include_irf:
                # 使用Bootstrap残差重采样方法计算VECM的脉冲响应置信区间
                irf_result = self._vecm_bootstrap_irf(
                    df=df_clean,
                    vecm_result=result,
                    coint_rank=selected_rank,
                    k_ar_diff=lags,
                    periods=self.irf_periods,
                    bootstrap_reps=self.bootstrap_reps
                )
                model_result["impulse_response"] = irf_result

            return model_result

        except Exception as e:
            logger.error(f"VECM拟合失败: {e}")
            return {"success": False, "error": str(e)}

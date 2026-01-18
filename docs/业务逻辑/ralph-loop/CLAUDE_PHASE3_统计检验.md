# CLAUDE.md - Phase 3: 统计检验模块扩展

## 📋 阶段目标

扩展统计检验功能，新增JB正态性检验、实现自动滞后阶数选择，并完整实现多变量检验模块（5个检验）。

**核心原则**：
- 单变量检验：4项（ADF、JB、Ljung-Box、ARCH LM）
- 多变量检验：5项（Pearson相关、VIF、Panel ADF、Johansen协整、格兰杰因果）
- 自动滞后阶数：AIC/BIC准则
- 检验结果必须包含可解释的中文结论
- 前端展示检验结果和可视化

---

## 📚 术语定义

| 术语 | 定义 | 统计含义 |
|------|------|---------|
| **JB检验** | Jarque-Bera正态性检验 | H0：数据服从正态分布，p<0.05拒绝H0 |
| **ADF检验** | Augmented Dickey-Fuller单位根检验 | H0：存在单位根（非平稳），p<0.05拒绝H0（平稳） |
| **Ljung-Box Q检验** | 自相关性检验（白噪声） | H0：无自相关，p<0.05拒绝H0（有自相关） |
| **ARCH LM检验** | 条件异方差检验 | H0：无ARCH效应，p<0.05拒绝H0（有ARCH效应） |
| **Pearson相关** | 线性相关系数矩阵 | r∈[-1,1]，绝对值越大相关性越强 |
| **VIF** | 方差膨胀因子，检测多重共线性 | VIF>10表示严重共线性 |
| **Panel ADF** | 面板数据单位根检验 | 多变量平稳性检验 |
| **Johansen协整** | 检验多个非平稳序列的长期均衡关系 | 迹检验和最大特征值检验 |
| **格兰杰因果** | 检验变量间的预测因果关系 | 非真正因果，仅统计上的领先滞后关系 |
| **自动滞后阶数** | 遍历滞后1到maxlag，选择AIC/BIC最小的阶数 | 避免过拟合或欠拟合 |

---

## 🔍 现有实现分析

### 已实现功能（/root/test/utils/stat_tests.py）

**现有代码**：
```python
# ✅ ADF检验（完整）
def adf_test(series):
    result = adfuller(series.dropna())
    return {
        'Test Statistic': float(result[0]),
        'p-value': float(result[1]),
        'Used Lag': int(result[2]),
        'Number of Observations': int(result[3]),
        'Is Stationary (p<0.05)': bool(result[1] < 0.05)
    }

# ⚠️ Ljung-Box Q检验（固定滞后）
def ljung_box_test(residuals, lags=10):  # ❌ 固定lags=10
    lb_df = acorr_ljungbox(residuals.dropna(), lags=[lags], return_df=True)
    # ...

# ⚠️ ARCH LM检验（固定滞后）
def arch_lm_test(residuals, lags=10):  # ❌ 固定lags=10
    result = het_arch(residuals.dropna(), nlags=lags)
    # ...
```

**缺失功能**：
1. ❌ **JB正态性检验**：完全缺失
2. ❌ **自动滞后阶数选择**：Ljung-Box和ARCH LM使用固定lags=10
3. ❌ **所有多变量检验**：Pearson相关、VIF、Panel ADF、Johansen、格兰杰因果全部缺失

---

## 🎯 详细任务清单

### Task 3.1: 扩展单变量检验服务

**目标**：新增JB检验，实现自动滞后阶数选择

#### 子任务 3.1.1: 创建统计检验服务类

**文件**：`/root/stock-mcp/src/server/domain/services/statistical_tests_service.py`

**实现内容**：
```python
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
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] 4个单变量检验方法全部实现
- [ ] JB检验返回正确的统计量和p值
- [ ] 自动滞后阶数选择逻辑正确（遍历并选择AIC最小）
- [ ] 每个检验都有中文结论和解释

---

### Task 3.2: 实现多变量检验服务

**目标**：实现5个多变量检验

#### 子任务 3.2.1: 创建多变量检验服务类

**文件**：`/root/stock-mcp/src/server/domain/services/multivariate_tests_service.py`

**实现内容**：
```python
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
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] 5个多变量检验方法全部实现
- [ ] Pearson相关返回相关矩阵和高相关对
- [ ] VIF计算正确，标记VIF>10的变量
- [ ] Panel ADF对每个变量单独检验
- [ ] Johansen返回协整秩和迹检验结果
- [ ] 格兰杰因果两两检验，自动选择滞后阶数

---

### Task 3.3: 创建统计检验API端点

**目标**：提供单变量和多变量检验的API接口

#### 子任务 3.3.1: 创建API路由文件

**文件**：`/root/stock-mcp/src/server/api/routes/statistics.py`

**实现内容**：
```python
"""统计检验API路由"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any
import pandas as pd
import numpy as np
import os
import json
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
```

**验证标准**：
- [ ] 2个端点实现（univariate, multivariate）
- [ ] 单变量检验返回4项检验结果
- [ ] 多变量检验返回5项检验结果
- [ ] 文件路径处理正确（支持processed和dataset）
- [ ] 多文件对齐逻辑正确

#### 子任务 3.3.2: 注册路由

**文件**：`/root/stock-mcp/src/server/app.py`

**修改内容**：
```python
from src.server.api.routes import statistics

app.include_router(statistics.router)
```

---

### Task 3.4: 修改测试代码中的统计检验逻辑

**目标**：更新`/root/test/utils/stat_tests.py`，使其与服务类一致

**文件**：`/root/test/utils/stat_tests.py`

**修改方案**：
1. 新增`jarque_bera_test()`函数
2. 修改`ljung_box_test()`为`ljung_box_auto()`（自动滞后）
3. 修改`arch_lm_test()`为`arch_lm_auto()`（自动滞后）

**修改后的代码**：
```python
from scipy.stats import jarque_bera

def jarque_bera_test(series):
    """JB正态性检验"""
    try:
        stat, p_value = jarque_bera(series.dropna())
        return {
            'jb_stat': float(stat),
            'p-value': float(p_value),
            'Is Normal (p>0.05)': bool(p_value > 0.05)
        }
    except Exception as e:
        logging.error(f"JB Test failed: {e}")
        return {"error": str(e)}

def ljung_box_auto(residuals, max_lags=20):
    """Ljung-Box Q检验（自动滞后）"""
    # ... 实现与服务类相同的逻辑

def arch_lm_auto(residuals, max_lags=20):
    """ARCH LM检验（自动滞后）"""
    # ... 实现与服务类相同的逻辑
```

---

### Task 3.5: 创建统计检验前端页面

**目标**：新建前端页面展示统计检验结果

#### 子任务 3.5.1: 创建统计检验页面

**文件**：`/root/frontend/src/pages/statistical-tests/page.tsx`（新建）

**实现内容**（关键部分）：
```typescript
import React, { useState } from 'react';
import { toast } from 'react-hot-toast';

const StatisticalTestsPage = () => {
  const [testType, setTestType] = useState<'univariate' | 'multivariate'>('univariate');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 运行检验
  const handleRunTests = async () => {
    setLoading(true);
    try {
      if (testType === 'univariate') {
        const res = await fetch('/api/statistics/univariate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: selectedFiles[0],
            value_col: 'close_price'
          })
        });
        const data = await res.json();
        setResults(data.tests);
      } else {
        const res = await fetch('/api/statistics/multivariate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filenames: selectedFiles,
            value_col: 'close_price'
          })
        });
        const data = await res.json();
        setResults(data.tests);
      }
      toast.success('检验完成');
    } catch (error) {
      toast.error(`检验失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="statistical-tests-page">
      <h1>统计检验</h1>
      
      {/* 检验类型选择 */}
      <div className="test-type-selector">
        <button onClick={() => setTestType('univariate')}>
          单变量检验
        </button>
        <button onClick={() => setTestType('multivariate')}>
          多变量检验
        </button>
      </div>
      
      {/* 文件选择 */}
      {/* ... */}
      
      {/* 运行按钮 */}
      <button onClick={handleRunTests} disabled={loading}>
        {loading ? '检验中...' : '运行检验'}
      </button>
      
      {/* 结果展示 */}
      {results && (
        <div className="results-display">
          {testType === 'univariate' ? (
            <>
              <TestResultCard title="ADF单位根检验" data={results.adf} />
              <TestResultCard title="JB正态性检验" data={results.jb} />
              <TestResultCard title="Ljung-Box Q检验" data={results.ljung_box} />
              <TestResultCard title="ARCH LM检验" data={results.arch_lm} />
            </>
          ) : (
            <>
              <CorrelationHeatmap data={results.pearson_correlation} />
              <VIFTable data={results.vif} />
              <TestResultCard title="Panel ADF检验" data={results.panel_adf} />
              <TestResultCard title="Johansen协整检验" data={results.johansen} />
              <GrangerCausalityMatrix data={results.granger_causality} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

**验证标准**：
- [ ] 页面创建成功
- [ ] 可切换单变量/多变量检验
- [ ] 可选择数据文件
- [ ] 检验结果正确展示（表格+图表）
- [ ] 相关矩阵热力图正常显示

#### 子任务 3.5.2: 添加到路由

**文件**：`/root/frontend/src/router/index.tsx`

**修改内容**：
```typescript
{
  path: '/statistical-tests',
  element: <StatisticalTestsPage />
}
```

---

### Task 3.6: 创建统计检验验证测试

**文件**：`/root/stock-mcp/tests/test_statistical_tests.py`

**实现内容**（部分示例）：
```python
"""统计检验测试"""

import pytest
import pandas as pd
import numpy as np
from src.server.domain.services.statistical_tests_service import StatisticalTestsService
from src.server.domain.services.multivariate_tests_service import MultivariateTestsService

@pytest.fixture
def sample_stationary_series():
    """平稳序列"""
    return pd.Series(np.random.randn(100))

@pytest.fixture
def sample_non_stationary_series():
    """非平稳序列（随机游走）"""
    return pd.Series(np.cumsum(np.random.randn(100)))

def test_adf_stationary(sample_stationary_series):
    """测试：ADF检验平稳序列"""
    service = StatisticalTestsService()
    result = service.adf_test(sample_stationary_series)
    
    assert "is_stationary" in result
    assert result["is_stationary"] == True  # 应判断为平稳

def test_jb_normal():
    """测试：JB检验正态分布数据"""
    normal_data = pd.Series(np.random.randn(1000))
    service = StatisticalTestsService()
    result = service.jarque_bera_test(normal_data)
    
    assert "is_normal" in result
    # 大样本正态数据应通过JB检验

def test_ljung_box_auto():
    """测试：Ljung-Box自动滞后"""
    series = pd.Series(np.random.randn(100))
    service = StatisticalTestsService()
    result = service.ljung_box_auto(series)
    
    assert "selected_lag" in result
    assert result["selected_lag"] >= 1

# ... 更多测试
```

---

## ⚠️ 注意事项与常见陷阱

### 🛑 1. JSON序列化兼容性（致命问题）
**问题**：
- `pandas`和`scipy`计算结果通常是`numpy.int64`/`float64`
- Python标准`json`库无法序列化numpy类型（报错`TypeError`）
- 更严重：`np.nan`序列化为`NaN`（非标准JSON），前端`JSON.parse()`会报`SyntaxError`白屏

**解决方案**：
- 必须在返回API响应前使用`sanitize_for_json()`函数递归清洗
- `numpy`类型 → 原生`int/float`
- `NaN/Inf` → `null`（前端可识别）

### 🛑 2. 数据非数值化导致的计算崩溃（健壮性）
**问题**：
- 用户CSV可能包含千分位符（"1,200.00"）、货币符号（"¥100"）、文本占位符（"--"）
- `pd.read_csv`可能将这些列识别为`Object`（String）
- 直接传入`adfuller`或`corr()`会导致500错误

**解决方案**：
- 读取数据后必须执行`pd.to_numeric(df[col], errors='coerce')`
- 无法解析的字符变为NaN，再执行填充/删除逻辑

### 🛑 3. 多变量数据对齐（严重bug风险）
**问题**：
- 简单的`pd.concat(axis=1)`按行索引对齐
- 如果多个CSV起始日期不同或中间有缺失日期，直接连接会导致时间轴错位
- 相关性、协整、格兰杰检验结果完全失效

**解决方案**：
- 必须指定日期列，转为`DatetimeIndex`
- 使用`inner join`确保公共时间段
- 对齐后检查数据量是否足够

### 🛑 4. 热力图渲染策略（架构决策）
**问题**：
- 后端用Matplotlib生成PNG图片消耗服务器资源
- 传输慢，前端无法交互（如鼠标悬停显示数值）
- 多线程环境Matplotlib有线程安全问题

**解决方案**：
- **Phase 3 API只返回JSON数据**，不返回图片
- 相关矩阵返回二维数组，前端用ECharts/Recharts渲染
- Phase 5报告生成时才由后端画图（生成Word文档）

### 5. JB检验的样本量要求
**问题**：小样本（<30）JB检验不可靠
**解决方案**：样本量<20时直接拒绝，20-30时给出警告

### 6. 自动滞后阶数的上限
**问题**：滞后阶数过大导致过拟合
**解决方案**：限制`max_lag = min(指定值, n//4)`

### 7. 格兰杰因果的方向性
**问题**：用户误解为真实因果关系
**解决方案**：结果中明确说明"仅表示统计上的领先滞后关系"

### 8. Johansen协整的数据要求
**问题**：变量必须同阶单整（如都是I(1)）
**解决方案**：先进行Panel ADF检验，确保所有变量非平稳
**备注**：当前`k_ar_diff=1`为固定值，如需精确控制，可在Phase 4的VECM建模时自动选择

### 9. VIF计算必须加常数项
**问题**：`statsmodels.variance_inflation_factor`要求数据显式包含截距项
**解决方案**：计算前执行`add_constant(df, prepend=True)`，索引+1跳过常数列

### 10. Panel ADF的术语说明
**问题**："Panel ADF"在学术上可指多种检验（LLC、IPS等）
**澄清**：本项目的Panel ADF指"对系统内各变量分别进行ADF检验，汇总结果"，非严格面板检验

---

### Task 3.7: 检验结果持久化（Phase 5 数据准备）

**目标**：保存检验结果JSON，为报告生成模块提供数据

**文件**：`/root/stock-mcp/src/server/api/routes/statistics.py`（需在API端点末尾添加）

**修改内容**：
```python
import json
from datetime import datetime

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
    
    return file_path

# 在两个API端点中调用（return之前添加）：
# save_test_results(user_id, "univariate", safe_results)
# save_test_results(user_id, "multivariate", safe_results)
```

**验证标准**：
- [ ] 每次检验后自动保存JSON到`/root/librechat_user_data/{user_id}/models/`
- [ ] 同时保存带时间戳版本和`latest_xxx.json`版本
- [ ] Phase 5报告生成可直接读取`latest_test_results_xxx.json`

---

## ✅ 阶段验收标准

完成Phase 3后，应达到以下标准：

### 1. 单变量检验
- [ ] 4个检验全部实现（ADF、JB、Ljung-Box、ARCH LM）
- [ ] Ljung-Box和ARCH LM实现自动滞后阶数选择
- [ ] 所有检验有中文结论和解释

### 2. 多变量检验
- [ ] 5个检验全部实现
- [ ] Pearson相关矩阵计算正确
- [ ] **VIF计算前添加常数项**
- [ ] Johansen返回协整秩
- [ ] 格兰杰因果自动选择滞后，两两检验

### 3. API层
- [ ] 2个API端点实现
- [ ] **`value_col`参数为必需（无默认值）**
- [ ] **JSON响应已做`sanitize_for_json`处理**
- [ ] **多变量对齐使用日期索引inner join**
- [ ] **样本量校验（<20拒绝，格兰杰需更多）**
- [ ] Swagger文档可访问

### 4. 结果持久化（新增）
- [ ] 检验结果保存为JSON
- [ ] `latest_test_results_xxx.json`可被Phase 5读取

### 5. 前端集成
- [ ] 统计检验页面创建成功
- [ ] 可展示所有检验结果
- [ ] **热力图由前端渲染（API不返回图片）**

### 6. 测试覆盖
- [ ] 单元测试全部通过
- [ ] 边界情况测试（小样本、完全共线、非数值输入等）

---

## 📝 下一阶段预告

完成Phase 3后，将进入**Phase 4: 时序模型构建重构与扩展**，主要任务包括：
- 调整ARIMA搜索范围
- 重构GARCH模型（ARMA均值方程+三种分布）
- 新增VAR/VECM的格兰杰因果和脉冲响应
- 创建模型API和前端对接

---

*本文档版本：v1.1*  
*最后更新：2026-01-15*

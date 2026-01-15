# CLAUDE.md - Phase 4: 时序模型构建重构与扩展

## 📋 阶段目标

重构和扩展6种时序模型的实现，核心任务包括：
1. 调整ARIMA/ARMA搜索范围（p,q∈[0,5], d∈[0,2]）
2. 重构GARCH模型（ARMA均值方程自动选择 + 三种分布支持）
3. 扩展VAR/VECM（新增格兰杰因果检验 + 脉冲响应分析）
4. 创建统一的模型API端点
5. 前端模型构建页面对接真实API

**核心原则**：
- 用户手动选择模型类型（非自动推荐）
- 不支持模型对比功能
- 所有建模数据永久保存
- 模型结果包含可用于报告生成的完整数据

---

## 📚 术语定义

| 术语 | 定义 | 参数范围 |
|------|------|---------|
| **ARIMA(p,d,q)** | 差分自回归移动平均模型 | p,q∈[0,5], d∈[0,2] |
| **ARMA(p,q)** | 自回归移动平均模型（d=0的ARIMA） | p,q∈[0,5] |
| **GARCH(p,q)** | 广义自回归条件异方差模型 | p,q∈[1,5] |
| **ARCH(p)** | 自回归条件异方差模型（GARCH的q=0） | p∈[1,5] |
| **VAR(k)** | 向量自回归模型 | k由AIC/BIC选择 |
| **VECM(r,k)** | 向量误差修正模型 | r=协整秩, k=滞后阶数 |
| **均值方程** | GARCH模型中描述条件均值的部分 | 自动选择ARMA(p,q) |
| **分布假设** | 残差的概率分布 | normal/t/ged |
| **脉冲响应(IRF)** | 一个变量冲击对其他变量的动态影响 | 10期, Bootstrap 500次, 95%置信 |

---

## 🔍 现有实现分析

### ARIMA/ARMA（/root/test/models/mean_models.py）

**现有代码**：
```python
model = AutoARIMA(season_length=1)  # ❌ 未明确限制搜索范围
```

**需要修改**：明确搜索范围 `max_p=5, max_q=5, max_d=2`

### GARCH/ARCH（/root/test/models/volatility_models.py）

**现有代码**：
```python
# ❌ 问题1: 搜索范围太小
max_p=3, max_q=3

# ❌ 问题2: 仅支持正态分布
dist='Normal'

# ❌ 问题3: 均值方程固定为常数
# arch_model默认 mean='Constant'
```

**需要修改**：
1. 搜索范围扩展到[1,5]
2. 支持三种分布
3. 实现ARMA均值方程自动选择

### VAR/VECM（/root/test/models/multivariate_models.py）

**现有代码**：
```python
# ✅ VAR自动阶数选择（AIC）- 已实现
# ✅ VECM协整检验（Johansen Trace）- 已实现
# ❌ 格兰杰因果检验 - 未实现
# ❌ 脉冲响应分析 - 未实现
```

---

## 🎯 详细任务清单

### Task 4.1: 重构ARIMA/ARMA模型

**目标**：明确搜索范围，统一返回格式

#### 子任务 4.1.1: 创建ARIMA服务类

**文件**：`/root/stock-mcp/src/server/domain/services/models/arima_service.py`

**实现内容**：
```python
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
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] 搜索范围明确为 p,q∈[0,5], d∈[0,2]
- [ ] fit_arima和fit_arma方法实现
- [ ] 返回完整的模型参数、指标和数据

---

### Task 4.2: 重构GARCH/ARCH模型（核心改动）

**目标**：实现ARMA均值方程自动选择 + 三种分布支持

#### 子任务 4.2.1: 创建GARCH服务类

**文件**：`/root/stock-mcp/src/server/domain/services/models/garch_service.py`

**实现内容**：
```python
"""GARCH/ARCH模型服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple, Literal
from arch import arch_model
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA
import logging

logger = logging.getLogger(__name__)

class GARCHService:
    """GARCH/ARCH模型服务类"""
    
    def __init__(self):
        # 搜索范围配置
        self.max_p_garch = 5  # GARCH波动率方程p
        self.max_q_garch = 5  # GARCH波动率方程q
        self.max_p_mean = 5   # 均值方程AR阶数
        self.max_q_mean = 5   # 均值方程MA阶数（注意arch库限制）
        
        # 支持的分布
        self.supported_distributions = ['normal', 't', 'ged']
    
    def _select_arma_order(self, series: pd.Series) -> Tuple[int, int]:
        """
        自动选择均值方程的ARMA阶数
        
        Args:
            series: 时间序列
        
        Returns:
            (p, q) 最优阶数
        """
        try:
            # 使用AutoARIMA选择最优阶数，d=0强制平稳
            df = pd.DataFrame({
                'unique_id': 'series1',
                'ds': pd.date_range('2000-01-01', periods=len(series), freq='D'),
                'y': series.values
            })
            
            model = AutoARIMA(
                season_length=1,
                max_p=self.max_p_mean,
                max_q=self.max_q_mean,
                d=0,  # 强制d=0
                max_d=0
            )
            
            sf = StatsForecast(models=[model], freq='D', n_jobs=1)
            sf.fit(df)
            
            fitted_model = sf.fitted_[0, 0].model_
            order = fitted_model.get('order', (1, 0, 1))
            
            return (order[0], order[2])  # 返回(p, q)
        
        except Exception as e:
            logger.warning(f"自动选择ARMA阶数失败: {e}，使用默认(1,1)")
            return (1, 1)
    
    def _optimize_garch_order(
        self, 
        series: pd.Series, 
        vol_type: str = 'Garch',
        distribution: str = 'normal',
        mean_type: str = 'ARX',
        ar_order: int = 1
    ) -> Tuple[int, int, Any, float]:
        """
        网格搜索最优GARCH阶数
        
        Returns:
            (best_p, best_q, best_model_result, scale_factor)
        """
        best_aic = float('inf')
        best_order = (1, 1)
        best_model = None
        
        # 数据缩放（避免数值稳定性问题）
        scale = 1.0
        if series.std() < 0.1:
            scale = 100.0
        scaled_series = series * scale
        
        # GARCH p,q范围
        ps = range(1, self.max_p_garch + 1)
        qs = range(1, self.max_q_garch + 1) if vol_type == 'Garch' else [0]
        
        for p in ps:
            for q in qs:
                try:
                    # 构建模型
                    # mean='ARX' 允许设置AR滞后
                    am = arch_model(
                        scaled_series,
                        vol=vol_type,
                        p=p, 
                        q=q,
                        mean=mean_type,
                        lags=ar_order if mean_type == 'ARX' else 0,
                        dist=distribution
                    )
                    
                    res = am.fit(disp='off')
                    
                    if res.aic < best_aic:
                        best_aic = res.aic
                        best_order = (p, q)
                        best_model = res
                
                except Exception as e:
                    logger.debug(f"GARCH({p},{q})拟合失败: {e}")
                    continue
        
        return best_order[0], best_order[1], best_model, scale
    
    def fit_garch(
        self,
        series: pd.Series,
        garch_order: Optional[Tuple[int, int]] = None,
        mean_order: Optional[Tuple[int, int]] = None,
        distribution: Literal['normal', 't', 'ged'] = 'normal'
    ) -> Dict[str, Any]:
        """
        拟合GARCH模型
        
        Args:
            series: 时间序列数据
            garch_order: (p,q) 波动率方程阶数，None为自动选择
            mean_order: (ar,ma) 均值方程阶数，None为自动选择
            distribution: 残差分布假设 ('normal', 't', 'ged')
        
        Returns:
            模型结果字典
        """
        try:
            series_clean = series.dropna()
            
            if distribution not in self.supported_distributions:
                raise ValueError(f"不支持的分布: {distribution}")
            
            # Step 1: 自动选择均值方程阶数
            if mean_order is None:
                ar_order, ma_order = self._select_arma_order(series_clean)
                logger.info(f"自动选择均值方程阶数: AR({ar_order}), MA({ma_order})")
            else:
                ar_order, ma_order = mean_order
            
            # 注意：arch库的mean='ARX'只支持AR部分，MA部分需要特殊处理
            # 简化处理：仅使用AR部分
            if ma_order > 0:
                logger.warning(f"arch库不直接支持MA均值方程，仅使用AR({ar_order})")
            
            # Step 2: 选择GARCH阶数
            if garch_order is not None:
                garch_p, garch_q = garch_order
                
                # 手动模式：直接拟合
                scale = 1.0
                if series_clean.std() < 0.1:
                    scale = 100.0
                scaled_series = series_clean * scale
                
                am = arch_model(
                    scaled_series,
                    vol='Garch',
                    p=garch_p,
                    q=garch_q,
                    mean='ARX',
                    lags=ar_order,
                    dist=distribution
                )
                res = am.fit(disp='off')
            else:
                # 自动模式：网格搜索
                garch_p, garch_q, res, scale = self._optimize_garch_order(
                    series_clean,
                    vol_type='Garch',
                    distribution=distribution,
                    mean_type='ARX',
                    ar_order=ar_order
                )
                
                if res is None:
                    return {"success": False, "error": "无法拟合任何GARCH模型"}
            
            # Step 3: 提取结果
            n = len(series_clean)
            
            # 校正LogLikelihood（因为数据缩放）
            log_lik_corrected = res.loglikelihood - n * np.log(scale)
            
            # 计算校正后的AIC/BIC
            n_params = res.num_params
            aic_corrected = 2 * n_params - 2 * log_lik_corrected
            bic_corrected = n_params * np.log(n) - 2 * log_lik_corrected
            
            # 还原残差和条件波动率
            residuals = (res.resid / scale).tolist()
            cond_vol = (res.conditional_volatility / scale).tolist()
            std_resid = res.std_resid.tolist() if hasattr(res, 'std_resid') else None
            
            # 拟合值 = 原始值 - 残差
            fitted = (series_clean - (res.resid / scale)).tolist()
            
            # R²计算
            y_true = series_clean.values
            y_fitted = np.array(fitted)
            mask = ~np.isnan(y_true) & ~np.isnan(y_fitted)
            sst = ((y_true[mask] - y_true[mask].mean())**2).sum()
            sse = ((y_true[mask] - y_fitted[mask])**2).sum()
            r2 = 1 - (sse/sst) if sst > 0 else 0
            
            # 分布参数
            dist_params = {}
            if distribution == 't':
                # t分布自由度
                if 'nu' in res.params.index:
                    dist_params['nu'] = float(res.params['nu'])
            elif distribution == 'ged':
                # GED shape参数
                if 'nu' in res.params.index:
                    dist_params['nu'] = float(res.params['nu'])
            
            return {
                "success": True,
                "model_name": f"GARCH({garch_p},{garch_q})",
                "model_type": "GARCH",
                "mean_equation": {
                    "type": "AR",
                    "order": ar_order,
                    "note": "arch库限制，仅支持AR均值方程"
                },
                "volatility_equation": {
                    "p": garch_p,
                    "q": garch_q
                },
                "distribution": distribution,
                "distribution_params": dist_params,
                "parameters": {
                    "all_params": res.params.to_dict(),
                    "p_values": res.pvalues.to_dict()
                },
                "metrics": {
                    "r2": float(r2),
                    "log_likelihood": float(log_lik_corrected),
                    "aic": float(aic_corrected),
                    "bic": float(bic_corrected),
                    "n_observations": n
                },
                "data": {
                    "original": series_clean.tolist(),
                    "fitted": fitted,
                    "residuals": residuals,
                    "conditional_volatility": cond_vol,
                    "standardized_residuals": std_resid
                },
                "scale_factor": scale,
                "search_range": {
                    "garch_p_range": f"[1, {self.max_p_garch}]",
                    "garch_q_range": f"[1, {self.max_q_garch}]"
                }
            }
        
        except Exception as e:
            logger.error(f"GARCH拟合失败: {e}")
            return {"success": False, "error": str(e)}
    
    def fit_arch(
        self,
        series: pd.Series,
        arch_order: Optional[int] = None,
        mean_order: Optional[Tuple[int, int]] = None,
        distribution: Literal['normal', 't', 'ged'] = 'normal'
    ) -> Dict[str, Any]:
        """
        拟合ARCH模型（GARCH的q=0）
        
        Args:
            series: 时间序列数据
            arch_order: p阶数，None为自动选择
            mean_order: (ar,ma) 均值方程阶数
            distribution: 残差分布假设
        
        Returns:
            模型结果字典
        """
        garch_order = (arch_order, 0) if arch_order else None
        
        result = self.fit_garch(
            series, 
            garch_order=garch_order,
            mean_order=mean_order,
            distribution=distribution
        )
        
        if result.get("success"):
            result["model_type"] = "ARCH"
            result["model_name"] = f"ARCH({result['volatility_equation']['p']})"
        
        return result
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] 自动选择ARMA均值方程阶数（`_select_arma_order`）
- [ ] 支持三种分布（normal, t, ged）
- [ ] 搜索范围扩展到[1,5]
- [ ] 返回分布参数（t分布自由度、GED shape）
- [ ] 返回条件波动率序列

#### 子任务 4.2.2: 更新测试代码中的GARCH实现

**文件**：`/root/test/models/volatility_models.py`

**修改要点**：
1. 添加distribution参数
2. 实现均值方程选择
3. 扩展搜索范围

---

### Task 4.3: 扩展VAR/VECM模型

**目标**：新增格兰杰因果检验和脉冲响应分析

#### 子任务 4.3.1: 创建VAR/VECM服务类

**文件**：`/root/stock-mcp/src/server/domain/services/models/var_service.py`

**实现内容**：
```python
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
            irf_err = irf.err_band_mabdol(repl=bootstrap_reps, sigs=[0.05])
            
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
            model = VAR(df)
            
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
                "n_observations": len(df) - selected_lag
            }
            
            # R²（每个方程）
            r2_by_eq = {}
            resid_df = result.resid
            for col in df.columns:
                y_true = df[col].iloc[selected_lag:].values
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
            for col in df.columns:
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
                "variables": df.columns.tolist(),
                "n_variables": len(df.columns),
                "parameters": {
                    col: result.params[col].to_dict() 
                    for col in result.params.columns
                },
                "metrics": metrics,
                "data": {
                    "original": df.to_dict(orient='list'),
                    "fitted": fitted_data,
                    "residuals": resid_data
                }
            }
            
            # 格兰杰因果检验
            if include_granger:
                granger_result = self._granger_causality_test(df, self.max_lag_granger)
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
            # 自动选择协整秩
            if coint_rank is None:
                rank_test = select_coint_rank(
                    df, 
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
            model = VECM(df, k_ar_diff=lags, coint_rank=selected_rank, deterministic="ci")
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
            start_idx = len(df) - valid_len
            
            r2_by_eq = {}
            for col in df.columns:
                y_true = df[col].iloc[start_idx:].values
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
            for col in df.columns:
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
                "variables": df.columns.tolist(),
                "n_variables": len(df.columns),
                "parameters": {
                    "alpha": result.alpha.tolist(),  # 调整系数
                    "beta": result.beta.tolist(),    # 协整向量
                    "gamma": result.gamma.tolist()   # 短期动态系数
                },
                "metrics": metrics,
                "data": {
                    "original": df.to_dict(orient='list'),
                    "fitted": fitted_data,
                    "residuals": resid_data
                }
            }
            
            # 格兰杰因果检验
            if include_granger:
                granger_result = self._granger_causality_test(df, self.max_lag_granger)
                model_result["granger_causality"] = granger_result
            
            # 脉冲响应（VECM使用Bootstrap方法计算置信区间）
            if include_irf:
                # 使用Bootstrap残差重采样方法计算VECM的脉冲响应置信区间
                irf_result = self._vecm_bootstrap_irf(
                    df=df,
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
```

**验证标准**：
- [ ] 服务类创建成功
- [ ] 格兰杰因果检验实现（两两变量，自动选阶）
- [ ] 脉冲响应分析实现（Bootstrap 500次，95%置信，10期）
- [ ] 方差分解实现
- [ ] VAR和VECM返回完整结果

---

### Task 4.4: 创建模型API端点

**目标**：提供6种模型的统一API接口

**文件**：`/root/stock-mcp/src/server/api/routes/models.py`

**实现内容**：
```python
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

router = APIRouter(prefix="/api/models", tags=["models"])

# ===== 请求模型 =====

class ARIMARequest(BaseModel):
    filename: str
    value_col: str = "close_price"
    order: Optional[List[int]] = None  # [p,d,q]

class GARCHRequest(BaseModel):
    filename: str
    value_col: str = "close_price"
    garch_order: Optional[List[int]] = None  # [p,q]
    mean_order: Optional[List[int]] = None   # [ar,ma]
    distribution: Literal['normal', 't', 'ged'] = 'normal'

class VARRequest(BaseModel):
    filenames: List[str]
    value_col: str = "close_price"
    lags: Optional[int] = None
    include_granger: bool = True
    include_irf: bool = True

class VECMRequest(BaseModel):
    filenames: List[str]
    value_col: str = "close_price"
    coint_rank: Optional[int] = None
    lags: int = 1
    include_granger: bool = True
    include_irf: bool = True

# ===== 工具函数 =====

def _load_data(filename: str, user_id: str, value_col: str) -> pd.Series:
    """
    加载数据
    
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
    
    Returns:
        时间序列数据
    
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
    
    return df[value_col]

def _load_multivariate_data(filenames: List[str], user_id: str, value_col: str) -> pd.DataFrame:
    """
    加载多变量数据
    
    ⚠️ 重要说明：
    - 支持中文文件名
    - 多个文件按行对齐（inner join），可能导致数据量减少
    - 返回的DataFrame列名使用文件名（去除.csv后缀）
    
    Args:
        filenames: 多个数据文件名（支持中文）
        user_id: 用户ID
        value_col: 数据列名（所有文件必须使用相同的列名）
    
    Returns:
        多变量DataFrame，每列为一个变量
    """
    from urllib.parse import unquote
    
    dfs = []
    for filename in filenames:
        series = _load_data(filename, user_id, value_col)
        col_name = filename.replace('.csv', '')
        dfs.append(pd.DataFrame({col_name: series.values}))
    
    merged = pd.concat(dfs, axis=1).dropna()
    return merged

def _save_model_result(result: dict, model_type: str, user_id: str) -> str:
    """保存模型结果"""
    import time
    output_dir = f"/root/librechat_user_data/{user_id}/models"
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = int(time.time())
    filename = f"{model_type}_{timestamp}.json"
    file_path = os.path.join(output_dir, filename)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    return file_path

# ===== API端点 =====

@router.post("/arima")
async def fit_arima(request: ARIMARequest):
    """拟合ARIMA模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(request.filename, user_id, request.value_col)
        
        order = tuple(request.order) if request.order else None
        
        service = ARIMAService()
        result = service.fit_arima(series, order=order)
        
        if result.get("success"):
            saved_path = _save_model_result(result, "arima", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"ARIMA API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arma")
async def fit_arma(request: ARIMARequest):
    """拟合ARMA模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(request.filename, user_id, request.value_col)
        
        order = (request.order[0], request.order[2]) if request.order else None
        
        service = ARIMAService()
        result = service.fit_arma(series, order=order)
        
        if result.get("success"):
            saved_path = _save_model_result(result, "arma", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"ARMA API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/garch")
async def fit_garch(request: GARCHRequest):
    """拟合GARCH模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(request.filename, user_id, request.value_col)
        
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
            saved_path = _save_model_result(result, "garch", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"GARCH API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arch")
async def fit_arch(request: GARCHRequest):
    """拟合ARCH模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        series = _load_data(request.filename, user_id, request.value_col)
        
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
            saved_path = _save_model_result(result, "arch", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"ARCH API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/var")
async def fit_var(request: VARRequest):
    """拟合VAR模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        df = _load_multivariate_data(request.filenames, user_id, request.value_col)
        
        service = VARVECMService()
        result = service.fit_var(
            df,
            lags=request.lags,
            include_granger=request.include_granger,
            include_irf=request.include_irf
        )
        
        if result.get("success"):
            saved_path = _save_model_result(result, "var", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"VAR API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vecm")
async def fit_vecm(request: VECMRequest):
    """拟合VECM模型"""
    try:
        user_id = get_current_user_id() or "anonymous"
        df = _load_multivariate_data(request.filenames, user_id, request.value_col)
        
        service = VARVECMService()
        result = service.fit_vecm(
            df,
            coint_rank=request.coint_rank,
            lags=request.lags,
            include_granger=request.include_granger,
            include_irf=request.include_irf
        )
        
        if result.get("success"):
            saved_path = _save_model_result(result, "vecm", user_id)
            result["saved_path"] = saved_path
        
        return result
    
    except Exception as e:
        logger.error(f"VECM API错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**验证标准**：
- [ ] 6个API端点全部实现
- [ ] 模型结果保存到`/models/`目录
- [ ] 返回JSON格式结果

---

### Task 4.5: 前端模型构建页面对接

**目标**：修改前端页面，连接真实API

**文件**：`/root/frontend/src/pages/model-building/page.tsx`

**主要修改**：
1. 替换mock数据为真实API调用
2. 添加GARCH分布选择下拉框
3. 显示模型结果（参数表、指标、图表）
4. 保存模型结果路径

---

## ⚠️ 注意事项与常见陷阱

### 1. GARCH均值方程的arch库限制
**问题**：`arch`库的`mean='ARX'`只支持AR部分，不直接支持MA
**解决方案**：
- 仅使用AR均值方程
- 在结果中说明此限制
- 用户如需MA，建议使用其他库（如rugarch R包）

### 2. 脉冲响应的计算时间
**问题**：Bootstrap 500次可能很慢
**解决方案**：
- 使用异步任务（后续Phase 6处理）
- 或减少Bootstrap次数到200（权衡精度和速度）

### 3. 多变量数据对齐
**问题**：不同文件时间范围不同
**解决方案**：使用inner join，并检查对齐后数据量是否足够

### 4. 数值稳定性
**问题**：某些数据可能导致模型不收敛
**解决方案**：
- 数据缩放（如GARCH中的scale）
- 捕获异常并返回友好错误

### 5. 模型结果保存
**问题**：JSON保存numpy数组需要转换
**解决方案**：所有numpy类型转为Python原生类型

---

## ✅ 阶段验收标准

完成Phase 4后，应达到以下标准：

1. **ARIMA/ARMA**
   - [ ] 搜索范围明确为p,q∈[0,5], d∈[0,2]
   - [ ] 自动和手动阶数选择都可用
   - [ ] 返回完整参数和数据

2. **GARCH/ARCH**
   - [ ] 均值方程自动选择AR阶数（arch库限制，仅支持AR）
   - [ ] 支持三种分布（normal, t, ged）
   - [ ] 返回条件波动率序列

3. **VAR/VECM**
   - [ ] 格兰杰因果检验实现（两两变量）
   - [ ] **格兰杰因果的滞后阶数使用AIC准则选择**（非min(p-value)）
   - [ ] VAR脉冲响应分析实现（Bootstrap 500次，95%置信区间）
   - [ ] **VECM脉冲响应必须有Bootstrap置信区间**（通过残差重采样实现）
   - [ ] 方差分解实现

4. **API层**
   - [ ] 6个模型API端点全部实现
   - [ ] **支持中文文件名**（如"中国GDP年率.csv"）
   - [ ] **动态列名传递**（不同数据源列名不同）
   - [ ] 模型结果保存到/models/目录
   - [ ] Swagger文档可访问

5. **前端集成**
   - [ ] 模型构建页面连接真实API
   - [ ] 可选择GARCH分布类型
   - [ ] 显示模型结果

---

## 📝 下一阶段预告

完成Phase 4后，将进入**Phase 5: 学术报告生成系统**，主要任务包括：
- Qwen API客户端（经济学含义生成）
- Matplotlib图表生成（10种图表）
- python-docx Word报告生成
- 报告API端点和前端对接

---

*本文档版本：v1.0*  
*最后更新：2026-01-15*

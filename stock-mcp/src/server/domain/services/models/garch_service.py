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
            # 确保数据是数值类型
            series_numeric = pd.to_numeric(series, errors='coerce')
            series_clean = series_numeric.dropna()

            if len(series_clean) == 0:
                return {"success": False, "error": "数据转换为数值类型后无有效数据"}

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

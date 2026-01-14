import pandas as pd
import numpy as np
from statsmodels.tsa.api import VAR
from statsmodels.tsa.vector_ar.vecm import VECM, select_coint_rank


def calculate_system_metrics(model_res, df):
    """
    Calculate metrics for multivariate system.
    """
    n_obs = len(df)
    # Statsmodels results classes usually have these properties
    try:
        aic = model_res.aic
        bic = model_res.bic
        llf = model_res.llf
    except:
        aic = None
        bic = None
        llf = None
        
    return {
        "LogLik": float(llf) if llf else None,
        "AIC": float(aic) if aic else None,
        "BIC": float(bic) if bic else None
    }

def calculate_equation_r2(y_true, residuals):
    """
    Calculate R2 for each equation.
    R2 = 1 - SSE/SST
    """
    r2_scores = {}
    for col in y_true.columns:
        y = y_true[col]
        res = residuals[col]
        # Align
        mask = ~np.isnan(res)
        if mask.sum() == 0:
            r2_scores[col] = None
            continue
            
        y = y[mask]
        res = res[mask]
        
        sst = ((y - y.mean())**2).sum()
        sse = (res**2).sum()
        
        if sst == 0:
            r2_scores[col] = 0.0
        else:
            r2_scores[col] = 1 - (sse/sst)
            
    return r2_scores

def run_var(df, lags=None):
    """
    Run VAR.
    lags: int (manual) or None (auto AIC).
    """
    try:
        model = VAR(df)
        
        if lags is None:
            # Auto selection
            lag_order_results = model.select_order(maxlags=10)
            selected_lag = lag_order_results.aic
        else:
            selected_lag = lags
            
        fit_res = model.fit(selected_lag)
        
        # Metrics
        sys_metrics = calculate_system_metrics(fit_res, df)
        
        # R2 per equation
        # fittedvalues in statsmodels VAR is the in-sample prediction
        # residuals available
        # Need to map residuals to original columns
        resid_df = fit_res.resid
        r2_map = calculate_equation_r2(df.iloc[selected_lag:], resid_df)
        
        # Add avg R2 to system metrics for quick view
        r2_values = [v for v in r2_map.values() if v is not None]
        sys_metrics['R2_Avg'] = float(np.mean(r2_values)) if r2_values else None
        
        # Prepare Data
        # Realign to match original frame size (fill Lag rows with None)
        fitted_data = {}
        resid_data = {}
        
        for col in df.columns:
            # Prepend Nones
            fitted_col = [None]*selected_lag + fit_res.fittedvalues[col].tolist()
            resid_col = [None]*selected_lag + fit_res.resid[col].tolist()
            
            fitted_data[col] = fitted_col
            resid_data[col] = resid_col

        return {
            "model_name": f"VAR(lags={selected_lag})",
            "metrics": sys_metrics,
            "equation_metrics": {"R2": r2_map},
            "parameters": {
                "coefficients": {col: fit_res.params[col].to_dict() for col in fit_res.params.columns},
                "selected_lag": int(selected_lag)
            },
            "data": {
                "original": df.to_dict(orient='list'),
                "fitted": fitted_data,
                "residuals": resid_data
            }
        }
    except Exception as e:
        return {"error": f"VAR failed: {str(e)}"}

def run_vecm(df, rank=None, lags=1):
    """
    Run VECM.
    rank: int (manual) or None (auto trace test).
    lags: int (lag difference, k_ar_diff). Default 1 usually.
    """
    try:
        # Auto Rank Selection if None
        if rank is None:
            rank_test = select_coint_rank(df, det_order=0, k_ar_diff=lags, method="trace", signif=0.05)
            r = rank_test.rank
            # If rank is 0, VECM technically invalid/same as VAR diff, but user wants VECM.
            # We fit it anyway if r=0 usually just warns or we force r=1 if user insists on VECM behavior?
            # Or accept r? Let's use computed r.
        else:
            r = rank
            
        model = VECM(df, k_ar_diff=lags, coint_rank=r, deterministic="ci")
        fit_res = model.fit()
        
        # Metrics
        sys_metrics = calculate_system_metrics(fit_res, df)
        
        # R2 per equation
        resid_df = fit_res.resid
        # VECM fitted values match original length minus (lags+1)? VECM lag structure is complex.
        # residuals length = N - k_ar_diff.
        # Let's align.
        valid_len = len(resid_df)
        start_idx = len(df) - valid_len
        
        r2_map = calculate_equation_r2(df.iloc[start_idx:], resid_df)
        r2_values = [v for v in r2_map.values() if v is not None]
        sys_metrics['R2_Avg'] = float(np.mean(r2_values)) if r2_values else None
        
        # Prepare Data
        fitted_data = {}
        resid_data = {}
        
        for col in df.columns:
            fitted_col = [None]*start_idx + fit_res.fittedvalues[col].tolist()
            resid_col = [None]*start_idx + fit_res.resid[col].tolist()
            fitted_data[col] = fitted_col
            resid_data[col] = resid_col

        return {
            "model_name": f"VECM(rank={r}, lags={lags})",
            "metrics": sys_metrics,
            "equation_metrics": {"R2": r2_map},
            "parameters": {
                "alpha": fit_res.alpha.tolist(),
                "beta": fit_res.beta.tolist(),
                "gamma": fit_res.gamma.tolist(),
                "selected_rank": int(r)
            },
            "data": {
                "original": df.to_dict(orient='list'),
                "fitted": fitted_data,
                "residuals": resid_data
            }
        }
    except Exception as e:
        return {"error": f"VECM failed: {str(e)}"}

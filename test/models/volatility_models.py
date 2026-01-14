from arch import arch_model
import numpy as np
import pandas as pd
import pandas as pd

def r2_score_manual(y_true, y_pred):
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

def calculate_metrics(y_true, y_pred, n_params, log_likelihood, resid):
    """
    R2 for volatility models is often measured on squared residuals vs variance,
    but here we might return the LogLik/AIC/BIC as primary.
    We will compute simple R2 of the Mean Model component if available, OR
    R2 of variance prediction (proxy: r^2 vs sigma^2).
    Let's stick to standard likelihood metrics + R2 of the underlying series fit (usually constant mean).
    """
    n = len(y_true)
    
    # AIC/BIC directly from model usually, but calculating here if needed
    aic = 2 * n_params - 2 * log_likelihood
    bic = n_params * np.log(n) - 2 * log_likelihood
    
    # R2 of the mean equation
    # y_true vs (y_true - resid)
    y_fitted = y_true - resid
    r2 = r2_score_manual(y_true, y_fitted)
    
    return {
        "R2": float(r2),
        "LogLik": float(log_likelihood),
        "AIC": float(aic),
        "BIC": float(bic)
    }

def optimize_garch_order(series, vol_type='Garch', max_p=3, max_q=3):
    """
    Grid search for best (p,q) based on AIC.
    """
    best_aic = float('inf')
    best_order = (1, 1)
    best_model = None
    
    qs = range(1, max_q + 1) if vol_type == 'Garch' else [0]
    ps = range(1, max_p + 1)
    
    # Scaling
    scale = 1.0
    if series.std() < 0.1:
        scale = 100.0
    scaled_series = series * scale

    for p in ps:
        for q in qs:
            try:
                am = arch_model(scaled_series, vol=vol_type, p=p, q=q, dist='Normal')
                res = am.fit(disp='off')
                if res.aic < best_aic:
                    best_aic = res.aic
                    best_order = (p, q)
                    best_model = res
            except:
                continue
                
    return best_order, best_model, scale

def run_volatility_model(series, p=None, q=None, vol_type='Garch'):
    """
    Unified GARCH/ARCH handler.
    If p (and q for GARCH) provided -> Manual.
    Else -> Auto Grid Search.
    """
    try:
        series_clean = series.dropna()
        
        # 1. Model Selection & Fitting
        if p is not None:
            # Manual
            current_q = q if q is not None else 0
            # Scaling check
            scale = 1.0
            if series_clean.std() < 0.1:
                scale = 100.0
            scaled_series = series_clean * scale
            
            am = arch_model(scaled_series, vol=vol_type, p=p, q=current_q, dist='Normal')
            res = am.fit(disp='off')
            selected_order = (p, current_q)
        else:
            # Auto
            max_q = 3 if vol_type == 'Garch' else 0
            order, res, scale = optimize_garch_order(series_clean, vol_type, max_p=3, max_q=max_q)
            selected_order = order
            
        if res is None:
            return {"error": "Could not fit any model in grid search."}

        # 2. Extract Results
        # Metrics
        # Note: arch library AIC/BIC are for the SCALED series.
        # However, LogLik differs by a constant due to scaling.
        # AIC_orig = AIC_scaled - 2*N*ln(scale)
        # We will report what the library gives but note the scaling, 
        # OR attempt to correct LogLik. Correcting is better for "true" fit.
        # LogLik_raw = LogLik_scaled - N * ln(scale)
        n = len(series_clean)
        log_lik_corrected = res.loglikelihood - n * np.log(scale)
        
        # Re-calc AIC/BIC based on corrected Likelihood
        n_params = res.num_params
        metrics = calculate_metrics(
            series_clean.values, 
            None, # y_pred handled inside via resid
            n_params, 
            log_lik_corrected, 
            res.resid / scale
        )
        
        # Override AIC/BIC with corrected versions or keep consistency?
        # Let's use the standard formula based on corrected loglik
        metrics['AIC'] = 2 * n_params - 2 * log_lik_corrected
        metrics['BIC'] = n_params * np.log(n) - 2 * log_lik_corrected

        # Data arrays
        residuals = (res.resid / scale).tolist()
        cond_vol = (res.conditional_volatility / scale).tolist()
        # Fitted values (Mean equation fit) = Original - Residuals
        fitted = (series_clean - (res.resid / scale)).tolist()
        
        return {
            "model_name": f"{vol_type}{selected_order}",
            "metrics": metrics,
            "parameters": {
                "coefficients": res.params.to_dict(),
                "p_values": res.pvalues.to_dict(),
                "selected_order": selected_order,
                "scale_factor": scale
            },
            "data": {
                "original": series_clean.tolist(),
                "fitted": fitted, # Mean equation fitted
                "residuals": residuals,
                "conditional_volatility": cond_vol
            }
        }

    except Exception as e:
        return {"error": f"{vol_type} failed: {str(e)}"}

def run_garch(series, p=None, q=None):
    # GARCH needs p and q
    return run_volatility_model(series, p=p, q=q, vol_type='Garch')

def run_arch(series, p=None):
    # ARCH uses q parameter as lag in 'arch' lib terms usually, 
    # but arch_model(vol='ARCH', p=P) -> order of ARCH is P. 
    # Library signature: arch_model(y, x, mean, lags, vol, p, o, q, ...)
    # For vol='ARCH', 'p' is the lag order. 'q' is ignored.
    return run_volatility_model(series, p=p, q=0, vol_type='ARCH')

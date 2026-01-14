from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, ARIMA
import pandas as pd
import numpy as np
import numpy as np

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

def calculate_metrics(y_true, y_pred, n_params, log_likelihood=None, aic=None, bic=None):
    """
    Helper to calculate R2, LogLik, AIC, BIC if not provided.
    """
    # Remove NaNs from alignment
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    y_t = y_true[mask]
    y_p = y_pred[mask]
    
    if len(y_t) == 0:
        return {"R2": None, "LogLik": None, "AIC": None, "BIC": None}

    r2 = r2_score_manual(y_t, y_p)
    
    # Calculate Residuals
    residuals = y_t - y_p
    mse = np.mean(residuals**2)
    n = len(y_t)
    
    # Estimate Log Likelihood if missing (Gaussian assumption)
    if log_likelihood is None:
        log_likelihood = -n/2 * (np.log(2 * np.pi) + np.log(mse) + 1)
        
    # Calculate AIC/BIC if missing
    if aic is None:
        aic = 2 * n_params - 2 * log_likelihood
    if bic is None:
        bic = n_params * np.log(n) - 2 * log_likelihood
        
    return {
        "R2": float(r2),
        "LogLik": float(log_likelihood),
        "AIC": float(aic),
        "BIC": float(bic)
    }

def run_arima_type_model(df, order=None, model_type="ARIMA"):
    """
    Unified function for ARIMA and ARMA.
    If order=(p,d,q) is provided, runs specific ARIMA.
    If order is None, runs AutoARIMA (or AutoARMA if model_type='ARMA').
    
    Args:
        df: Dataframe with unique_id, ds, y.
        order: Tuple (p,d,q) for manual selection.
        model_type: "ARIMA" or "ARMA". Used to constrain AutoARMA (d=0).
    """
    try:
        y_orig = df['y'].values
        n_params = 0
        
        # 1. Select Model
        if order:
            # Manual Mode
            model = ARIMA(order=order, season_length=1)
            model_name = f"Manual {model_type}{order}"
            # Approximate params count: p + q + 1 (intercept) + 1 (sigma)
            n_params = sum(order) + 2 
        else:
            # Auto Mode
            if model_type == "ARMA":
                # AutoARMA: Constrain d=0
                model = AutoARIMA(d=0, max_d=0, season_length=1)
                model_name = "AutoARMA"
            else:
                # AutoARIMA
                model = AutoARIMA(season_length=1)
                model_name = "AutoARIMA"
                
        # 2. Fit
        sf = StatsForecast(models=[model], freq='D', n_jobs=1)
        sf.fit(df)
        
        # 3. Extract Results
        fitted_model = sf.fitted_[0, 0].model_
        
        # fitted values are not directly in fitted_model dict for StatsForecast usually,
        # but we can predict in-sample or use residuals if available
        # AutoARIMA object has 'fitted' property sometimes, or 'residuals'
        
        residuals = fitted_model.get('residuals')
        if residuals is None:
            # fallback predict in sample
            # This is complex with StatsForecast structure, usually predict() is future.
            # We will use predict_in_sample if available or recreate
            # For simplicity in this env, let's look at available keys
            pass

        # Handle AIC/BIC/LogLik
        aic = fitted_model.get('aic')
        bic = fitted_model.get('bic')
        log_lik = fitted_model.get('loglik')
        
        # Reconstruct fitted values
        # y_pred = y_true - residuals
        # Note: residuals length might differ due to differencing
        
        fitted_values = []
        full_residuals = []
        
        if residuals is not None:
            diff_len = len(y_orig) - len(residuals)
            # Pad beginning with NaNs for alignment
            full_residuals = [None] * diff_len + residuals.tolist()
            fitted_values = [None] * diff_len + (y_orig[diff_len:] - residuals).tolist()
        else:
            # Fallback if no residuals returned
            return {"error": "Model did not return residuals for metric calculation"}

        # Calculate metrics (Handling NaNs in fitted_values)
        metrics = calculate_metrics(
            y_orig, 
            np.array(fitted_values, dtype=float), 
            n_params=len(fitted_model.get('coef', {})) + 1, # approximation
            log_likelihood=log_lik,
            aic=aic,
            bic=bic
        )
        
        return {
            "model_name": model_name,
            "metrics": metrics,
            "parameters": {
                "coefficients": {k: float(v) for k,v in fitted_model.get('coef', {}).items()},
                "sigma2": float(fitted_model.get('sigma2', 0)),
                "selected_order": order if order else "Auto"
            },
            "data": {
                "original": y_orig.tolist(),
                "fitted": fitted_values,
                "residuals": full_residuals
            }
        }

    except Exception as e:
        return {"error": f"{model_type} failed: {str(e)}"}

def run_arima(df, order=None):
    return run_arima_type_model(df, order, "ARIMA")

def run_arma(df, order=None):
    return run_arima_type_model(df, order, "ARMA")

from statsmodels.tsa.stattools import adfuller
from statsmodels.stats.diagnostic import acorr_ljungbox, het_arch
import logging

def adf_test(series):
    """
    Augmented Dickey-Fuller Test for stationarity.
    H0: Series has a unit root (non-stationary).
    """
    try:
        result = adfuller(series.dropna())
        return {
            'Test Statistic': float(result[0]),
            'p-value': float(result[1]),
            'Used Lag': int(result[2]),
            'Number of Observations': int(result[3]),
            'Is Stationary (p<0.05)': bool(result[1] < 0.05)
        }
    except Exception as e:
        logging.error(f"ADF Test failed: {e}")
        return {"error": str(e)}

def ljung_box_test(residuals, lags=10):
    """
    Ljung-Box Q Test for autocorrelation in residuals.
    H0: Data is independently distributed (no autocorrelation).
    """
    try:
        # statsmodels returns a dataframe in newer versions
        lb_df = acorr_ljungbox(residuals.dropna(), lags=[lags], return_df=True)
        # Extract the value for the specific lag
        stat = lb_df['lb_stat'].iloc[0]
        p_val = lb_df['lb_pvalue'].iloc[0]
        
        return {
            'lb_stat': float(stat),
            'p-value': float(p_val),
            'Has Autocorrelation (p<0.05)': bool(p_val < 0.05)
        }
    except Exception as e:
        logging.error(f"Ljung-Box Test failed: {e}")
        return {"error": str(e)}

def arch_lm_test(residuals, lags=10):
    """
    ARCH-LM Test for conditional heteroscedasticity.
    H0: No ARCH effects.
    Note: het_arch might return different formats depending on imports.
    """
    try:
        # het_arch(resid, ddof=0, nlags=None, store=False)
        result = het_arch(residuals.dropna(), nlags=lags)
        return {
            'lm_stat': float(result[0]),
            'lm_pvalue': float(result[1]),
            'f_stat': float(result[2]),
            'f_pvalue': float(result[3]),
            'Has ARCH Effects (p<0.05)': bool(result[1] < 0.05)
        }
    except Exception as e:
        logging.error(f"ARCH-LM Test failed: {e}")
        return {"error": str(e)}

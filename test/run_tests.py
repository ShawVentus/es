import os
import json
import logging
import pandas as pd
import numpy as np
import sys

sys.path.append('/root/test')

from utils.data_processor import load_and_clean_data, prepare_for_statsforecast, align_multivariate_data, get_descriptive_stats
from utils.stat_tests import adf_test, ljung_box_test, arch_lm_test
from models.mean_models import run_arima, run_arma
from models.volatility_models import run_garch, run_arch
from models.multivariate_models import run_var, run_vecm

LOG_FILE = '/root/test/logs/execution.log'
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', handlers=[
    logging.FileHandler(LOG_FILE),
    logging.StreamHandler()
])

DATA_1 = '/root/librechat_user_data/anonymous/dataset/NVIDIA_Half_Year_Prices_202507_202601.csv'
DATA_2 = '/root/librechat_user_data/6960af6888ab635020cf8f68/dataset/NYSE_BABA_2025-07-13_2026-01-13.csv'
RESULT_DIR = '/root/test/results'

def translate_error(error_msg):
    error_msg = str(error_msg)
    if "not stationary" in error_msg or "unit root" in error_msg:
        return f"数据非平稳 (Non-stationary): 请尝试进行一阶差分处理。 ({error_msg})"
    if "LinAlgError" in error_msg or "Singular matrix" in error_msg or "positive definite" in error_msg:
        return f"矩阵奇异/线性相关 (Singular Matrix): 数据可能存在多重共线性，或者样本量太少。 ({error_msg})"
    if "missing values" in error_msg or "NaN" in error_msg:
        return f"数据包含空值 (NaN): 请先进行空值填充或剔除。 ({error_msg})"
    if "convergence" in error_msg.lower():
        return f"模型未收敛 (Convergence Failure): 请尝试调整参数或增加迭代次数。 ({error_msg})"
    if "no cointegration" in error_msg.lower():
        return f"未发现协整关系: 建议使用差分VAR模型。 ({error_msg})"
        
    return f"未知错误: {error_msg}"

def save_json(data, filename):
    filepath = os.path.join(RESULT_DIR, filename)
    # Serialize logic helper
    class NpEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, np.integer): return int(obj)
            if isinstance(obj, np.floating): return float(obj)
            if isinstance(obj, np.ndarray): return obj.tolist()
            return super().default(obj)
            
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False, cls=NpEncoder)
    logging.info(f"Saved results to {filepath}")

def run_univariate_tests():
    logging.info("Starting Univariate Tests...")
    results = {}
    
    try:
        df = load_and_clean_data(DATA_1)
        results['descriptive_stats'] = get_descriptive_stats(df)
        
        # 1. ARIMA / ARMA (StatsForecast)
        sf_df = prepare_for_statsforecast(df, id_col='ticker')
        
        # Auto Mode
        results['AutoARIMA'] = run_arima(sf_df, order=None)
        results['AutoARMA'] = run_arma(sf_df, order=None)
        
        # Manual Mode (Test)
        # ARMA(1,0) -> p=1, d=0, q=0
        results['ManualARMA_1_0'] = run_arima(sf_df, order=(1,0,0)) 
        
        # 2. GARCH / ARCH (Arch lib)
        series = df['close_price']
        
        # Auto Mode (Grid Search)
        results['AutoGARCH'] = run_garch(series, p=None)
        results['AutoARCH'] = run_arch(series, p=None)
        
        # Manual Mode
        results['ManualGARCH_1_1'] = run_garch(series, p=1, q=1)
        
    except Exception as e:
        logging.error(f"Univariate tests crashed: {e}")
        results['CRASH_ERROR'] = str(e)
        
    save_json(results, 'univariate_details.json')

def run_multivariate_tests():
    logging.info("Starting Multivariate Tests...")
    results = {}
    
    try:
        aligned_df = align_multivariate_data([DATA_1, DATA_2])
        
        # 1. VAR
        # Auto Mode
        results['AutoVAR'] = run_var(aligned_df, lags=None)
        # Manual Mode
        results['ManualVAR_L2'] = run_var(aligned_df, lags=2)
        
        # 2. VECM
        # Auto Rank
        results['AutoVECM'] = run_vecm(aligned_df, rank=None)
        # Manual Rank
        results['ManualVECM_R1'] = run_vecm(aligned_df, rank=1)
        
        # 3. Error Case (Singular)
        bad_df = aligned_df.copy()
        bad_df['Dup'] = bad_df.iloc[:,0]
        res_bad = run_var(bad_df)
        if 'error' in res_bad:
            results['Error_Singular'] = translate_error(res_bad['error'])
        else:
            results['Error_Singular'] = "Failed to catch error"

    except Exception as e:
        logging.error(f"Multivariate tests crashed: {e}")
        results['CRASH_ERROR'] = str(e)

    save_json(results, 'multivariate_details.json')

if __name__ == "__main__":
    run_univariate_tests()
    run_multivariate_tests()
    logging.info("All Unified Tests Completed.")

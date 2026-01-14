import pandas as pd
import numpy as np
import scipy.stats as stats
import logging

def load_and_clean_data(filepath, timestamp_col='timestamp', value_col='close_price'):
    """
    Load data from CSV, process timestamp, drop NaNs, and remove extreme outliers.
    """
    try:
        df = pd.read_csv(filepath)
        
        # Ensure timestamp is datetime
        if timestamp_col in df.columns:
            df[timestamp_col] = pd.to_datetime(df[timestamp_col], utc=True).dt.tz_convert(None) # Remove timezone for simplicity
            df = df.sort_values(timestamp_col)
        else:
            raise ValueError(f"Column {timestamp_col} not found in {filepath}")

        # Drop NaNs
        initial_len = len(df)
        df = df.dropna(subset=[value_col])
        if len(df) < initial_len:
            logging.info(f"Dropped {initial_len - len(df)} NaN rows from {filepath}")

        # Remove Extreme Outliers (Mean +/- 3*Std)
        mean_val = df[value_col].mean()
        std_val = df[value_col].std()
        upper_bound = mean_val + 3 * std_val
        lower_bound = mean_val - 3 * std_val
        
        outliers = df[(df[value_col] > upper_bound) | (df[value_col] < lower_bound)]
        if not outliers.empty:
            logging.info(f"Removing {len(outliers)} extreme outliers from {filepath}")
            df = df[(df[value_col] <= upper_bound) & (df[value_col] >= lower_bound)]

        return df
    except Exception as e:
        logging.error(f"Error loading {filepath}: {str(e)}")
        raise e

def get_descriptive_stats(df, value_col='close_price'):
    """
    Calculate Min, Median, Mean, Max, Std.Dev, Skewness, Kurtosis.
    """
    series = df[value_col]
    stats_dict = {
        'Min': series.min(),
        'Median': series.median(),
        'Mean': series.mean(),
        'Max': series.max(),
        'Std.Dev': series.std(),
        'Skewness': series.skew(),
        'Kurtosis': series.kurtosis()
    }
    # Convert numpy types to native float for JSON serialization
    return {k: float(v) for k, v in stats_dict.items()}

def align_multivariate_data(file_paths, timestamp_col='timestamp', value_col='close_price'):
    """
    Align multiple CSVs by timestamp using Inner Join.
    Returns a dataframe with timestamp index and columns as filenames (or tickers).
    """
    aligned_df = None
    
    for fp in file_paths:
        df = load_and_clean_data(fp, timestamp_col, value_col)
        # Use filename/ticker as column name. Assuming ticker is in file or just use 'y'
        # Let's extract ticker from file content if possible, else use processed filename
        ticker = df['ticker'].iloc[0] if 'ticker' in df.columns else fp.split('/')[-1]
        
        temp_df = df[[timestamp_col, value_col]].rename(columns={value_col: ticker})
        temp_df.set_index(timestamp_col, inplace=True)
        
        if aligned_df is None:
            aligned_df = temp_df
        else:
            aligned_df = aligned_df.join(temp_df, how='inner')
    
    if aligned_df is None or aligned_df.empty:
         raise ValueError("Aligned DataFrame is empty. Check time overlaps.")
         
    return aligned_df.sort_index()

def prepare_for_statsforecast(df, value_col='close_price', id_col='ticker', timestamp_col='timestamp'):
    """
    Format dataframe for StatsForecast (unique_id, ds, y).
    """
    # Ensure required columns exist
    sf_df = df.copy()
    if id_col not in sf_df.columns:
        sf_df['unique_id'] = 'Series1'
    else:
        sf_df['unique_id'] = sf_df[id_col]
        
    sf_df = sf_df.rename(columns={timestamp_col: 'ds', value_col: 'y'})
    return sf_df[['unique_id', 'ds', 'y']]

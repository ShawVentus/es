"""数据预处理服务"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class DataPreprocessingService:
    """数据预处理服务类"""

    def __init__(self):
        self.processing_log = []

    def clean_data(
        self,
        df: pd.DataFrame,
        value_col: str = 'close_price',
        timestamp_col: str = 'timestamp'
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        数据清洗：处理缺失值和异常值

        Args:
            df: 原始数据DataFrame
            value_col: 数据列名
            timestamp_col: 时间戳列名

        Returns:
            (处理后的DataFrame, 处理记录)
        """
        processing_record = {
            "original_length": len(df),
            "missing_count": 0,
            "outlier_count": 0,
            "final_length": 0
        }

        # 确保时间列为datetime类型并排序
        if timestamp_col in df.columns:
            df[timestamp_col] = pd.to_datetime(df[timestamp_col], utc=True).dt.tz_convert(None)
            df = df.sort_values(timestamp_col).reset_index(drop=True)

        # 步骤1: 统计并填充缺失值
        initial_missing = df[value_col].isna().sum()
        processing_record["missing_count"] = int(initial_missing)

        df[value_col] = df[value_col].ffill()  # 前值填充

        remaining_missing = df[value_col].isna().sum()
        if remaining_missing > 0:
            # 如果开头有缺失值（无前值可填充），用后值填充
            df[value_col] = df[value_col].bfill()
            logger.warning(f"开头有 {remaining_missing} 个缺失值，使用后值填充")

        logger.info(f"填充了 {initial_missing} 个缺失值")

        # 步骤2: 3σ法则检测并填充异常值
        mean_val = df[value_col].mean()
        std_val = df[value_col].std()
        upper_bound = mean_val + 3 * std_val
        lower_bound = mean_val - 3 * std_val

        outlier_mask = (df[value_col] > upper_bound) | (df[value_col] < lower_bound)
        outlier_count = int(outlier_mask.sum())
        processing_record["outlier_count"] = outlier_count

        if outlier_count > 0:
            # 记录异常值位置和原始值（用于报告）
            outlier_indices = df[outlier_mask].index.tolist()
            outlier_values = df.loc[outlier_mask, value_col].tolist()
            processing_record["outlier_details"] = {
                "indices": outlier_indices[:10],  # 只记录前10个
                "values": [float(v) for v in outlier_values[:10]]
            }

            # 标记为NaN并填充
            df.loc[outlier_mask, value_col] = np.nan
            df[value_col] = df[value_col].ffill()

            logger.info(f"检测到 {outlier_count} 个异常值（3σ法则），已用前值填充")

        processing_record["final_length"] = len(df)
        processing_record["mean"] = float(mean_val)
        processing_record["std"] = float(std_val)
        processing_record["upper_bound"] = float(upper_bound)
        processing_record["lower_bound"] = float(lower_bound)

        return df, processing_record

    def apply_log_transform(
        self,
        df: pd.DataFrame,
        value_col: str = 'close_price',
        log_type: str = 'log'
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        对数转换

        Args:
            df: 数据DataFrame
            value_col: 数据列名
            log_type: 'log' (自然对数) 或 'log1p' (log(1+x))

        Returns:
            (转换后的DataFrame, 转换记录)
        """
        transform_record = {
            "transform_type": log_type,
            "column": value_col,
            "original_min": float(df[value_col].min()),
            "original_max": float(df[value_col].max())
        }

        # 检查是否有非正值
        if df[value_col].min() <= 0 and log_type == 'log':
            raise ValueError(f"数据包含非正值（最小值: {df[value_col].min()}），无法进行自然对数转换。请使用log1p或先处理负值。")

        # 应用对数转换
        if log_type == 'log':
            df[value_col] = np.log(df[value_col])
        elif log_type == 'log1p':
            df[value_col] = np.log1p(df[value_col])
        else:
            raise ValueError(f"未知的对数类型: {log_type}")

        transform_record["transformed_min"] = float(df[value_col].min())
        transform_record["transformed_max"] = float(df[value_col].max())

        logger.info(f"应用 {log_type} 转换成功")

        return df, transform_record

    def apply_diff(
        self,
        df: pd.DataFrame,
        value_col: str = 'close_price',
        order: int = 1
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        差分转换

        Args:
            df: 数据DataFrame
            value_col: 数据列名
            order: 差分阶数（1或2）

        Returns:
            (转换后的DataFrame, 转换记录)
        """
        transform_record = {
            "transform_type": f"diff_order_{order}",
            "column": value_col,
            "original_length": len(df)
        }

        # 应用差分
        df[value_col] = df[value_col].diff(order)

        # 差分后前几行为NaN，删除这些行
        initial_len = len(df)
        df = df.dropna(subset=[value_col]).reset_index(drop=True)
        dropped_rows = initial_len - len(df)

        transform_record["dropped_rows"] = dropped_rows
        transform_record["final_length"] = len(df)

        logger.info(f"应用 {order} 阶差分，删除了前 {dropped_rows} 行NaN")

        return df, transform_record

    def get_descriptive_stats(
        self,
        df: pd.DataFrame,
        value_col: str = 'close_price'
    ) -> Dict[str, float]:
        """
        计算描述性统计

        Args:
            df: 数据DataFrame
            value_col: 数据列名

        Returns:
            包含统计指标的字典
        """
        series = df[value_col]
        stats_dict = {
            'count': int(len(series)),
            'min': float(series.min()),
            'max': float(series.max()),
            'mean': float(series.mean()),
            'median': float(series.median()),
            'std': float(series.std()),
            'skewness': float(series.skew()),
            'kurtosis': float(series.kurtosis())
        }

        return stats_dict

"""
数据清洗工具模块

提供通用的数据清洗函数，用于处理 MCP 工具返回的数据：
1. 删除所有空值（None, NaN, NaT, 空字符串等）
2. 将所有日期时间列只保留年月日
"""

import pandas as pd
import numpy as np
from typing import Any, Dict, List, Union
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)


def clean_mcp_data(
    data: Union[pd.DataFrame, Dict, List],
    remove_empty: bool = True,
    normalize_dates: bool = True,
    drop_empty_rows: bool = True,
    drop_empty_cols: bool = False
) -> Union[pd.DataFrame, Dict, List]:
    """
    清洗 MCP 工具返回的数据

    Args:
        data: 输入数据（DataFrame、字典或列表）
        remove_empty: 是否删除空值
        normalize_dates: 是否规范化日期（只保留年月日）
        drop_empty_rows: 是否删除全空的行
        drop_empty_cols: 是否删除全空的列

    Returns:
        清洗后的数据（与输入类型相同）
    """
    try:
        # 如果是 DataFrame
        if isinstance(data, pd.DataFrame):
            return _clean_dataframe(
                data,
                remove_empty=remove_empty,
                normalize_dates=normalize_dates,
                drop_empty_rows=drop_empty_rows,
                drop_empty_cols=drop_empty_cols
            )

        # 如果是字典
        elif isinstance(data, dict):
            return _clean_dict(data, normalize_dates=normalize_dates)

        # 如果是列表
        elif isinstance(data, list):
            return _clean_list(data, normalize_dates=normalize_dates)

        # 其他类型直接返回
        else:
            return data

    except Exception as e:
        logger.error(f"数据清洗失败: {e}", exc_info=True)
        return data  # 失败时返回原数据


def _clean_dataframe(
    df: pd.DataFrame,
    remove_empty: bool = True,
    normalize_dates: bool = True,
    drop_empty_rows: bool = True,
    drop_empty_cols: bool = False
) -> pd.DataFrame:
    """清洗 DataFrame"""
    df_cleaned = df.copy()

    # 1. 规范化日期列（只保留年月日）
    if normalize_dates:
        df_cleaned = _normalize_dates_in_dataframe(df_cleaned)

    # 2. 删除空值
    if remove_empty:
        # 将各种空值统一替换为 None
        df_cleaned = df_cleaned.replace({
            pd.NaT: None,
            np.nan: None,
            'NaN': None,
            'nan': None,
            'NaT': None,
            '': None,
            ' ': None
        })

    # 删除全空的行（独立于 remove_empty）
    if drop_empty_rows:
        df_cleaned = df_cleaned.dropna(how='all')

    # 删除全空的列（独立于 remove_empty）
    if drop_empty_cols:
        df_cleaned = df_cleaned.dropna(axis=1, how='all')

    # 3. 重置索引
    df_cleaned = df_cleaned.reset_index(drop=True)

    return df_cleaned


def _normalize_dates_in_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """规范化 DataFrame 中的日期列"""
    df_result = df.copy()

    for col in df_result.columns:
        # 检查列类型
        if pd.api.types.is_datetime64_any_dtype(df_result[col]):
            # 已经是 datetime 类型，直接转为 date
            df_result[col] = df_result[col].dt.date

        elif df_result[col].dtype == 'object':
            # 尝试解析字符串类型的日期
            try:
                # 尝试转换为 datetime（utc=True 处理时区）
                temp_col = pd.to_datetime(df_result[col], errors='coerce', utc=True)

                # 如果成功转换了至少 50% 的数据，认为这是日期列
                if temp_col.notna().sum() / len(temp_col) > 0.5:
                    # 转换为本地时间并只保留日期
                    df_result[col] = temp_col.dt.tz_localize(None).dt.date
            except:
                pass

    return df_result


def _clean_dict(data: Dict[str, Any], normalize_dates: bool = True) -> Dict[str, Any]:
    """清洗字典数据"""
    result = {}

    for key, value in data.items():
        # 跳过空值
        if value is None or value == '' or (isinstance(value, float) and np.isnan(value)):
            continue

        # 规范化日期
        if normalize_dates and _is_date_like(value):
            result[key] = _normalize_date_value(value)
        # 递归处理嵌套字典
        elif isinstance(value, dict):
            cleaned = _clean_dict(value, normalize_dates)
            if cleaned:  # 只保留非空字典
                result[key] = cleaned
        # 递归处理列表
        elif isinstance(value, list):
            cleaned = _clean_list(value, normalize_dates)
            if cleaned:  # 只保留非空列表
                result[key] = cleaned
        else:
            result[key] = value

    return result


def _clean_list(data: List[Any], normalize_dates: bool = True) -> List[Any]:
    """清洗列表数据"""
    result = []

    for item in data:
        # 跳过空值
        if item is None or item == '' or (isinstance(item, float) and np.isnan(item)):
            continue

        # 规范化日期
        if normalize_dates and _is_date_like(item):
            result.append(_normalize_date_value(item))
        # 递归处理嵌套字典
        elif isinstance(item, dict):
            cleaned = _clean_dict(item, normalize_dates)
            if cleaned:
                result.append(cleaned)
        # 递归处理嵌套列表
        elif isinstance(item, list):
            cleaned = _clean_list(item, normalize_dates)
            if cleaned:
                result.append(cleaned)
        else:
            result.append(item)

    return result


def _is_date_like(value: Any) -> bool:
    """判断值是否类似日期"""
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return True

    if isinstance(value, str):
        # 尝试解析为日期
        try:
            pd.to_datetime(value)
            return True
        except:
            return False

    return False


def _normalize_date_value(value: Any) -> str:
    """规范化单个日期值为 YYYY-MM-DD 格式"""
    try:
        if isinstance(value, str):
            dt = pd.to_datetime(value)
        elif isinstance(value, pd.Timestamp):
            dt = value
        elif isinstance(value, datetime):
            dt = value
        elif isinstance(value, date):
            return value.strftime('%Y-%m-%d')
        else:
            return value

        # 转为 YYYY-MM-DD 格式
        return dt.strftime('%Y-%m-%d')

    except:
        return value


def clean_csv_for_storage(df: pd.DataFrame) -> pd.DataFrame:
    """
    清洗 DataFrame 用于保存为 CSV

    专门用于 MCP 工具保存数据前的处理：
    1. 删除全空的行和列
    2. 规范化日期格式
    3. 保留空值（保持数据完整性）

    Args:
        df: 输入 DataFrame

    Returns:
        清洗后的 DataFrame
    """
    return _clean_dataframe(
        df,
        remove_empty=False,  # 保留空值，只删除全空行/列
        normalize_dates=True,
        drop_empty_rows=True,
        drop_empty_cols=True
    )


def clean_for_api_response(data: Any) -> Any:
    """
    清洗数据用于 API 响应

    用于 API 返回前的数据清洗：
    1. 删除所有空值
    2. 规范化日期格式

    Args:
        data: 输入数据（任意类型）

    Returns:
        清洗后的数据
    """
    return clean_mcp_data(
        data,
        remove_empty=True,
        normalize_dates=True,
        drop_empty_rows=True,
        drop_empty_cols=False
    )

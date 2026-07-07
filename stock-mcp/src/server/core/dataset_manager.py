# src/server/core/dataset_manager.py
"""
数据集管理器 (DatasetManager)

职责:
1. 保存数据集并自动计算统计量（Min/Max/Mean/Median/Std/Skew/Kurt）
2. 生成伴生元数据文件 (.meta.json)
3. 列出用户的所有数据集
4. 获取数据集预览（统计量 + 采样图点 + 表头）
5. 删除数据集（原子化删除 CSV 和 JSON）

文件存储路径规范:
- 用户数据目录: /librechat_user_data/{user_id}/dataset/
- CSV 文件: {filename}.csv
- 元数据文件: {filename}.meta.json

创建日期: 2026-01-13
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Union

import pandas as pd
import numpy as np

from src.server.utils.storage_paths import STORAGE_ROOT

# 配置日志
logger = logging.getLogger(__name__)

# 调试模式开关（可通过环境变量控制）
DEBUG_MODE = os.getenv("DATASET_MANAGER_DEBUG", "false").lower() == "true"


def _debug_log(message: str, **kwargs):
    """调试日志函数"""
    if DEBUG_MODE:
        extra_info = " | ".join(f"{k}={v}" for k, v in kwargs.items())
        logger.info(f"[DatasetManager DEBUG] {message} | {extra_info}")


class DatasetManager:
    """
    数据集管理器
    
    负责用户数据集的存储、读取、预览和删除操作。
    每个数据集由两个文件组成：
    - {filename}.csv: 实际数据
    - {filename}.meta.json: 元数据（行列数、统计量等）
    
    使用示例:
        manager = DatasetManager()
        result = manager.save_dataset(
            user_id="user123",
            df=pd.DataFrame(...),
            filename="BABA_2023_Stock_Data",
            category="Stock"
        )
    """
    
    # 基础数据目录（可通过环境变量覆盖）
    BASE_DATA_DIR = str(STORAGE_ROOT)
    
    # 数据集子目录名称
    DATASET_SUBDIR = "dataset"
    
    # 元数据文件后缀
    META_SUFFIX = ".meta.json"
    
    # 趋势图采样点数量
    CHART_SAMPLE_SIZE = 30
    
    # 表头预览行数
    HEAD_ROWS_COUNT = 10

    # 表尾预览行数
    TAIL_ROWS_COUNT = 10
    
    def __init__(self, base_dir: Optional[str] = None):
        """
        初始化数据集管理器
        
        Args:
            base_dir: 可选，覆盖默认的基础数据目录
        """
        if base_dir:
            self.base_dir = base_dir
        else:
            self.base_dir = self.BASE_DATA_DIR
        
        _debug_log("DatasetManager initialized", base_dir=self.base_dir)
    
    def _get_user_dataset_dir(self, user_id: str) -> Path:
        """
        获取用户的数据集目录路径
        
        Args:
            user_id: 用户ID
            
        Returns:
            Path: 用户数据集目录的 Path 对象
        """
        path = Path(self.base_dir) / user_id / self.DATASET_SUBDIR
        # 确保目录存在
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def _sanitize_filename(self, filename: str) -> str:
        """
        清理文件名，移除不安全字符
        
        Args:
            filename: 原始文件名
            
        Returns:
            str: 清理后的安全文件名
        """
        # 移除路径分隔符和其他危险字符
        dangerous_chars = ['/', '\\', '..', '<', '>', ':', '"', '|', '?', '*']
        safe_name = filename
        for char in dangerous_chars:
            safe_name = safe_name.replace(char, '_')
        
        # 移除 .csv 后缀（如果用户传入了）
        if safe_name.lower().endswith('.csv'):
            safe_name = safe_name[:-4]
        
        return safe_name.strip()
    
    def _calculate_statistics(self, df: pd.DataFrame) -> Dict[str, float]:
        """
        计算 DataFrame 的描述性统计量
        
        计算的统计量包括:
        - Min: 最小值
        - Max: 最大值
        - Mean: 均值
        - Median: 中位数
        - Std.Dev: 标准差
        - Skewness: 偏度
        - Kurtosis: 峰度
        
        Args:
            df: 需要计算统计量的 DataFrame
            
        Returns:
            Dict[str, float]: 统计量字典
        """
        stats = {}
        
        # 尝试找到数值列进行统计（优先使用 close 或第一个数值列）
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        
        if not numeric_cols:
            _debug_log("No numeric columns found for statistics")
            return {
                "Min": 0.0,
                "Max": 0.0,
                "Mean": 0.0,
                "Median": 0.0,
                "Std.Dev": 0.0,
                "Skewness": 0.0,
                "Kurtosis": 0.0
            }
        
        # 优先使用 'close' 列（股票数据常见）
        target_col = 'close' if 'close' in numeric_cols else numeric_cols[0]
        series = df[target_col].dropna()
        
        if len(series) == 0:
            _debug_log("Target column is empty", column=target_col)
            return {
                "Min": 0.0,
                "Max": 0.0,
                "Mean": 0.0,
                "Median": 0.0,
                "Std.Dev": 0.0,
                "Skewness": 0.0,
                "Kurtosis": 0.0
            }
        
        try:
            stats["Min"] = round(float(series.min()), 2)
            stats["Max"] = round(float(series.max()), 2)
            stats["Mean"] = round(float(series.mean()), 2)
            stats["Median"] = round(float(series.median()), 2)
            stats["Std.Dev"] = round(float(series.std()), 2)
            stats["Skewness"] = round(float(series.skew()), 3)
            stats["Kurtosis"] = round(float(series.kurtosis()), 3)
        except Exception as e:
            logger.warning(f"Error calculating statistics: {e}")
            stats = {
                "Min": 0.0,
                "Max": 0.0,
                "Mean": 0.0,
                "Median": 0.0,
                "Std.Dev": 0.0,
                "Skewness": 0.0,
                "Kurtosis": 0.0
            }
        
        _debug_log("Statistics calculated", column=target_col, stats=stats)
        return stats
    
    def save_dataset(
        self,
        user_id: str,
        df: pd.DataFrame,
        filename: str,
        category: str = "Stock"
    ) -> Dict[str, Any]:
        """
        保存数据集并生成元数据
        
        Args:
            user_id: 用户ID
            df: 要保存的 DataFrame
            filename: 文件名（不含扩展名）
            category: 数据分类（默认 'Stock'）
            
        Returns:
            Dict: 保存结果，包含 success, filename, stats 等信息
        """
        _debug_log("Saving dataset", user_id=user_id, filename=filename, rows=len(df))
        
        try:
            # 清理文件名
            safe_filename = self._sanitize_filename(filename)
            if not safe_filename:
                return {
                    "success": False,
                    "error": "Invalid filename provided"
                }
            
            # 获取用户目录
            user_dir = self._get_user_dataset_dir(user_id)
            
            # 文件路径
            csv_path = user_dir / f"{safe_filename}.csv"
            meta_path = user_dir / f"{safe_filename}{self.META_SUFFIX}"
            
            _debug_log("保存数据集路径", user_id=user_id, csv_path=csv_path)
            
            # 保存 CSV
            df.to_csv(csv_path, index=False, encoding='utf-8')
            csv_size = csv_path.stat().st_size
            
            # 计算统计量
            stats = self._calculate_statistics(df)
            
            # 生成元数据
            meta = {
                "filename": f"{safe_filename}.csv",
                "rows": len(df),
                "cols": len(df.columns),
                "columns": list(df.columns),
                "category": category,
                "stats": stats,
                "created_at": datetime.now().isoformat(),
                "size_bytes": csv_size,
                "size_formatted": self._format_size(csv_size)
            }
            
            # 保存元数据 (Atomic write)
            temp_meta_path = meta_path.with_suffix(".tmp")
            with open(temp_meta_path, 'w', encoding='utf-8') as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
            
            # 原子重命名
            os.replace(temp_meta_path, meta_path)
            
            logger.info(f"Dataset saved: {safe_filename} ({len(df)} rows)")
            _debug_log("Dataset saved successfully", path=str(csv_path))
            
            return {
                "success": True,
                "filename": safe_filename,
                "rows": len(df),
                "cols": len(df.columns),
                "stats": stats,
                "size_formatted": meta["size_formatted"]
            }
            
        except Exception as e:
            logger.error(f"Failed to save dataset: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    def list_datasets(self, user_id: str) -> List[Dict[str, Any]]:
        """
        列出用户的所有数据集
        
        通过读取 .meta.json 文件实现快速列表，无需解析 CSV
        
        Args:
            user_id: 用户ID
            
        Returns:
            List[Dict]: 数据集列表，每项包含元数据信息
        """
        _debug_log("Listing datasets", user_id=user_id)
        
        try:
            user_dir = self._get_user_dataset_dir(user_id)
            datasets = []
            
            # 扫描所有 .meta.json 文件
            for meta_file in user_dir.glob(f"*{self.META_SUFFIX}"):
                try:
                    with open(meta_file, 'r', encoding='utf-8') as f:
                        meta = json.load(f)
                    
                    # 验证对应的 CSV 文件存在
                    csv_filename = meta.get("filename", "")
                    csv_path = user_dir / csv_filename
                    
                    if csv_path.exists():
                        datasets.append({
                            "id": meta_file.stem.replace(self.META_SUFFIX, ""),
                            "filename": csv_filename,
                            "name": csv_filename,
                            "rows": meta.get("rows", 0),
                            "cols": meta.get("cols", 0),
                            "category": meta.get("category", "Unknown"),
                            "stats": meta.get("stats", {}),
                            "created_at": meta.get("created_at", ""),
                            "size_formatted": meta.get("size_formatted", "0 B")
                        })
                    else:
                        # CSV 文件丢失，清理孤立的元数据
                        logger.warning(f"Orphan meta file found: {meta_file}")
                        
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid meta file {meta_file}: {e}")
                    continue
            
            # 按创建时间倒序排列
            datasets.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            
            _debug_log("Datasets listed", count=len(datasets))
            return datasets
            
        except Exception as e:
            logger.error(f"Failed to list datasets: {e}", exc_info=True)
            return []
    
    def get_dataset_preview(
        self,
        user_id: str,
        filename: str
    ) -> Dict[str, Any]:
        """
        获取数据集预览
        
        包含:
        - meta: 完整元数据（含统计量）
        - chart_points: 趋势图采样点（用于前端绘图）
        - head_rows: 前10行数据（用于表格预览）
        
        Args:
            user_id: 用户ID
            filename: 文件名（含或不含 .csv 后缀）
            
        Returns:
            Dict: 预览数据
        """
        _debug_log("Getting dataset preview", user_id=user_id, filename=filename)
        
        try:
            # 清理文件名
            safe_filename = self._sanitize_filename(filename)
            user_dir = self._get_user_dataset_dir(user_id)
            
            csv_path = user_dir / f"{safe_filename}.csv"
            meta_path = user_dir / f"{safe_filename}{self.META_SUFFIX}"
            
            # 检查文件存在
            if not csv_path.exists():
                return {"success": False, "error": "Dataset not found"}
            
            # 读取元数据
            meta = {}
            if meta_path.exists():
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
            
            # 读取 CSV 数据
            df = pd.read_csv(csv_path)

            # 生成趋势图采样点
            chart_points = self._sample_chart_points(df)

            # 获取前 N 行
            head_rows = df.head(self.HEAD_ROWS_COUNT).values.tolist()
            columns = list(df.columns)

            # 获取后 N 行
            tail_rows = df.tail(self.TAIL_ROWS_COUNT).values.tolist()

            return {
                "success": True,
                "meta": meta,
                "chart_points": chart_points,
                "head_rows": head_rows,
                "tail_rows": tail_rows,
                "columns": columns,
                "total_rows": len(df)
            }
            
        except Exception as e:
            logger.error(f"Failed to get preview: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def _sample_chart_points(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        从 DataFrame 中均匀采样用于趋势图的数据点
        
        Args:
            df: 数据 DataFrame
            
        Returns:
            List[Dict]: 采样点列表，每个点包含 x（索引/日期）和 y（值）
        """
        try:
            # 确定 y 轴列（优先 close，否则第一个数值列）
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if not numeric_cols:
                return []
            
            y_col = 'close' if 'close' in numeric_cols else numeric_cols[0]
            
            # 确定 x 轴列（优先 date/datetime，否则使用索引）
            date_candidates = ['date', 'datetime', 'time', 'Date', 'DateTime']
            x_col = None
            for col in date_candidates:
                if col in df.columns:
                    x_col = col
                    break
            
            # 采样
            total_rows = len(df)
            if total_rows <= self.CHART_SAMPLE_SIZE:
                indices = list(range(total_rows))
            else:
                step = total_rows / self.CHART_SAMPLE_SIZE
                indices = [int(i * step) for i in range(self.CHART_SAMPLE_SIZE)]
            
            points = []
            for idx in indices:
                if idx < len(df):
                    row = df.iloc[idx]
                    point = {
                        "x": str(row[x_col]) if x_col else idx,
                        "y": float(row[y_col]) if not pd.isna(row[y_col]) else 0
                    }
                    points.append(point)
            
            return points
            
        except Exception as e:
            logger.warning(f"Error sampling chart points: {e}")
            return []
    
    def delete_dataset(self, user_id: str, filename: str) -> Dict[str, Any]:
        """
        删除数据集（原子化删除 CSV 和元数据）
        
        Args:
            user_id: 用户ID
            filename: 文件名
            
        Returns:
            Dict: 删除结果
        """
        _debug_log("Deleting dataset", user_id=user_id, filename=filename)
        
        try:
            safe_filename = self._sanitize_filename(filename)
            user_dir = self._get_user_dataset_dir(user_id)
            
            csv_path = user_dir / f"{safe_filename}.csv"
            meta_path = user_dir / f"{safe_filename}{self.META_SUFFIX}"
            
            deleted_files = []
            
            # 删除 CSV
            if csv_path.exists():
                csv_path.unlink()
                deleted_files.append(str(csv_path))
            
            # 删除元数据
            if meta_path.exists():
                meta_path.unlink()
                deleted_files.append(str(meta_path))
            
            if deleted_files:
                logger.info(f"Dataset deleted: {safe_filename}")
                _debug_log("Dataset deleted", files=deleted_files)
                return {"success": True, "deleted_files": deleted_files}
            else:
                return {"success": False, "error": "Files not found"}
                
        except Exception as e:
            logger.error(f"Failed to delete dataset: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """
        格式化文件大小
        
        Args:
            size_bytes: 字节数
            
        Returns:
            str: 格式化的大小字符串（如 "1.5 MB"）
        """
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"


# 单例实例（可选，用于依赖注入）
_instance: Optional[DatasetManager] = None


def get_dataset_manager() -> DatasetManager:
    """
    获取 DatasetManager 单例实例
    
    Returns:
        DatasetManager: 管理器实例
    """
    global _instance
    if _instance is None:
        _instance = DatasetManager()
    return _instance

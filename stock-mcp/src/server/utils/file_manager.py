# src/server/utils/file_manager.py
"""
文件管理器 (FileManager)

主要功能:
    1. 管理 MCP 工具产生的大数据文件的存储与读取
    2. 提供基于 session_id 的用户级目录隔离
    3. 生成唯一的、基于时间戳的文件名，防止覆盖
    4. 提供安全的文件读取接口，防止目录遍历攻击

存储目录结构:
    /root/stock-mcp/storage/
        ├── {session_id_1}/
        │   ├── 20260111_143052_a1b2c3.json
        │   └── 20260111_143105_d4e5f6.csv
        └── {session_id_2}/
            └── ...

依赖:
    - 无外部依赖 (Phase 1)
    - pandas (Phase 2, CSV 支持)
"""

import json
import csv
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Union

from src.server.utils.logger import logger


class FileManager:
    """
    文件管理器类
    
    职责:
        - 管理存储根目录
        - 生成唯一文件路径
        - 写入和读取 JSON 数据
        - 路径安全验证
    """
    
    # 存储根目录：统一的用户数据存储位置，供Frontend后端访问
    STORAGE_ROOT = Path("/root/librechat_user_data")
    
    # 支持的文件格式
    SUPPORTED_FORMATS = {"json", "csv", "txt"}
    
    def __init__(
        self, 
        session_id: str = None,
        user_id: str = None,
        category: str = "temp"
    ):
        """
        初始化文件管理器
        
        Args:
            session_id: FastMCP 提供的会话 ID
            user_id: LibreChat用户ID (MongoDB ObjectId字符串)
            category: 存储类别 ("temp" 临时文件, "dataset" 数据集)
        
        目录结构:
            - temp: /root/librechat_user_data/{user_id}/temp/{session_id}/
            - dataset: /root/librechat_user_data/{user_id}/dataset/
        """
        self.user_id = user_id or session_id or "anonymous"
        self.session_id = session_id
        self.category = category
        
        # 构建目录路径（分层存储）
        if category == "dataset":
            # 数据集目录：用于存放重要的用户数据
            self.session_dir = self.STORAGE_ROOT / self.user_id / "dataset"
        else:
            # 临时目录：用于存放MCP工具中间产物
            session_folder = session_id or "default"
            self.session_dir = self.STORAGE_ROOT / self.user_id / "temp" / session_folder
        
        self._ensure_directory_exists()
        logger.info(f"[FileManager] 初始化完成 - 用户: {self.user_id}, 类别: {category}, 目录: {self.session_dir}")
    
    def _ensure_directory_exists(self) -> None:
        """
        确保会话目录存在，不存在则创建
        """
        self.session_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"[FileManager] 会话目录已就绪: {self.session_dir}")
    
    def _generate_unique_filename(self, prefix: str = "data", extension: str = "json") -> str:
        """
        生成唯一的文件名
        
        格式: {prefix}_{timestamp}_{hash}.{extension}
        例如: data_20260111_143052_a1b2c3.json
        
        Args:
            prefix: 文件名前缀，用于标识数据类型
            extension: 文件扩展名
        
        Returns:
            生成的唯一文件名
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # 使用时间戳+随机因子生成短哈希，确保唯一性
        hash_input = f"{timestamp}{self.session_id}{id(self)}"
        short_hash = hashlib.md5(hash_input.encode()).hexdigest()[:6]
        return f"{prefix}_{timestamp}_{short_hash}.{extension}"
    
    def save_json(self, data: Union[Dict, List], prefix: str = "data") -> str:
        """
        将数据保存为 JSON 文件
        
        Args:
            data: 要保存的数据 (字典或列表)
            prefix: 文件名前缀
        
        Returns:
            保存的文件绝对路径
        """
        filename = self._generate_unique_filename(prefix=prefix, extension="json")
        file_path = self.session_dir / filename
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        
        logger.info(f"[FileManager] JSON 数据已保存: {file_path}")
        return str(file_path)
    
    def _flatten_data(self, data: Union[Dict, List]) -> List[Dict]:
        """
        将嵌套数据扁平化为可写入CSV的行列表
        
        支持的输入格式:
            1. List[Dict]: 直接返回 (最常见的历史价格数据格式)
            2. Dict with 'data' key: 提取 data 字段
            3. Dict with list values: 提取第一个列表值
        
        Args:
            data: 原始数据 (字典或列表)
        
        Returns:
            扁平化后的字典列表，可直接写入CSV
        """
        # Case 1: 已经是列表
        if isinstance(data, list):
            if all(isinstance(item, dict) for item in data):
                return data
            # 如果是简单值列表，转换为字典
            return [{"value": item} for item in data]
        
        # Case 2: 字典
        if isinstance(data, dict):
            # 优先检查常见的包装键
            for key in ['data', 'items', 'results', 'records', 'prices']:
                if key in data and isinstance(data[key], list):
                    return self._flatten_data(data[key])
            
            # 查找任何列表类型的值
            for value in data.values():
                if isinstance(value, list) and len(value) > 0:
                    return self._flatten_data(value)
            
            # 如果没有列表，将字典本身作为单行
            return [data]
        
        # 其他情况返回空列表
        return []
    
    def save_csv(
        self, 
        data: Union[Dict, List], 
        prefix: str = "data",
        filename: str = None
    ) -> str:
        """
        将数据保存为 CSV 文件
        
        Args:
            data: 要保存的数据 (字典或列表)
            prefix: 文件名前缀 (当filename为None时使用)
            filename: 自定义文件名 (不含扩展名)，如果提供则使用此名称
        
        Returns:
            保存的文件绝对路径
        """
        # 扁平化数据
        rows = self._flatten_data(data)
        
        if not rows or all(not row for row in rows):
            error_msg = "[FileManager] 数据为空，无法保存为CSV"
            logger.error(error_msg)
            raise ValueError("Cannot save empty data to CSV")
        
        # 生成文件名
        if filename:
            # 清理文件名，移除不安全字符
            safe_filename = self._sanitize_filename(filename)
            final_filename = f"{safe_filename}.csv"
        else:
            final_filename = self._generate_unique_filename(prefix=prefix, extension="csv")
        
        file_path = self.session_dir / final_filename
        
        # 收集所有可能的列名 (处理不同行可能有不同键的情况)
        # 优先保留第一条记录的键顺序，然后追加其他键
        all_keys = set()
        first_row_keys = []
        
        for i, row in enumerate(rows):
            if isinstance(row, dict):
                if i == 0:
                    # 保留第一行的键顺序
                    first_row_keys = list(row.keys())
                all_keys.update(row.keys())
        
        # 先使用第一行的键顺序，再追加其他键（按字母排序）
        if first_row_keys:
            remaining_keys = sorted(all_keys - set(first_row_keys))
            fieldnames = first_row_keys + remaining_keys
        else:
            fieldnames = sorted(list(all_keys))
        
        # 写入CSV
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            for row in rows:
                if isinstance(row, dict):
                    writer.writerow(row)
        
        logger.info(f"[FileManager] CSV 数据已保存: {file_path} ({len(rows)} 行)")
        return str(file_path)
    
    def _sanitize_filename(self, filename: str) -> str:
        """
        清理文件名，移除或替换不安全字符
        
        Args:
            filename: 原始文件名
        
        Returns:
            安全的文件名
        """
        # 移除路径分隔符和其他危险字符
        unsafe_chars = ['/', '\\', '..', ':', '*', '?', '"', '<', '>', '|']
        safe_name = filename
        for char in unsafe_chars:
            safe_name = safe_name.replace(char, '_')
        
        # 限制长度
        if len(safe_name) > 200:
            safe_name = safe_name[:200]
        
        return safe_name
    
    @classmethod
    def is_safe_path(cls, file_path: str) -> bool:
        """
        验证文件路径是否安全 (防止目录遍历攻击)
        
        安全条件:
            1. 路径必须在 STORAGE_ROOT 目录下
            2. 路径不能包含 '..' 等危险字符
            3. 不允许符号链接指向存储目录外
        
        Args:
            file_path: 待验证的文件路径
        
        Returns:
            True 如果路径安全，False 否则
        """
        try:
            path = Path(file_path)
            resolved_path = path.resolve()
            storage_root_resolved = cls.STORAGE_ROOT.resolve()
            
            # 检查路径是否在存储根目录下
            if not str(resolved_path).startswith(str(storage_root_resolved) + "/") and resolved_path != storage_root_resolved:
                return False
            
            # 额外检查：如果是符号链接，确保目标也在安全目录内
            if path.is_symlink():
                real_path = path.resolve(strict=True)
                if not str(real_path).startswith(str(storage_root_resolved) + "/"):
                    return False
            
            return True
        except Exception:
            return False
    
    @classmethod
    def read_json(cls, file_path: str) -> Union[Dict, List]:
        """
        读取 JSON 文件内容
        
        Args:
            file_path: JSON 文件的绝对路径
        
        Returns:
            解析后的 JSON 数据
        
        Raises:
            ValueError: 如果路径不安全或文件不存在
            json.JSONDecodeError: 如果文件不是有效的 JSON
        """
        # 安全检查
        if not cls.is_safe_path(file_path):
            raise ValueError(f"不安全的文件路径: {file_path}。只允许读取 {cls.STORAGE_ROOT} 下的文件。")
        
        path = Path(file_path)
        if not path.exists():
            raise ValueError(f"文件不存在: {file_path}")
        
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        logger.debug(f"[FileManager] JSON 数据已读取: {file_path}")
        return data
    
    @classmethod
    def read_file_with_pagination(
        cls, 
        file_path: str, 
        offset: int = 0, 
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        分页读取文件内容 (Phase 2 增强功能)
        
        Args:
            file_path: 文件的绝对路径
            offset: 起始偏移量 (对于 JSON List 是元素索引，对于 CSV 是行号)
            limit: 返回的最大条目数
        
        Returns:
            包含分页数据和元信息的字典:
            {
                "data": [...],
                "total": 1000,
                "offset": 0,
                "limit": 50,
                "has_more": True
            }
        
        Raises:
            ValueError: 如果路径不安全或文件不存在
        """
        # 安全检查
        if not cls.is_safe_path(file_path):
            raise ValueError(f"不安全的文件路径: {file_path}。只允许读取 {cls.STORAGE_ROOT} 下的文件。")
        
        path = Path(file_path)
        if not path.exists():
            raise ValueError(f"文件不存在: {file_path}")
        
        extension = path.suffix.lower()
        
        if extension == ".json":
            return cls._read_json_paginated(path, offset, limit)
        elif extension == ".csv":
            return cls._read_csv_paginated(path, offset, limit)
        else:
            # 纯文本按行分页
            return cls._read_text_paginated(path, offset, limit)
    
    @classmethod
    def _read_json_paginated(cls, path: Path, offset: int, limit: int) -> Dict[str, Any]:
        """
        分页读取 JSON 文件 (内部方法)
        """
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        if isinstance(data, list):
            total = len(data)
            sliced_data = data[offset : offset + limit]
            return {
                "data": sliced_data,
                "total": total,
                "offset": offset,
                "limit": limit,
                "has_more": offset + limit < total,
                "format": "json"
            }
        else:
            # 如果是字典，直接返回全部
            return {
                "data": data,
                "total": 1,
                "offset": 0,
                "limit": 1,
                "has_more": False,
                "format": "json"
            }
    
    @classmethod
    def _read_csv_paginated(cls, path: Path, offset: int, limit: int) -> Dict[str, Any]:
        """
        分页读取 CSV 文件 (Phase 2, 需要 pandas)
        
        注意: offset 是数据行的偏移量（不含表头），从 0 开始计数
        """
        try:
            import pandas as pd
        except ImportError:
            raise ImportError("CSV 分页读取需要 pandas 库，请安装: pip install pandas")
        
        # 先获取总行数 (不含表头)
        with open(path, "r", encoding="utf-8") as f:
            total = sum(1 for _ in f) - 1  # 减去表头
        
        if total <= 0:
            return {
                "data": [],
                "total": 0,
                "offset": offset,
                "limit": limit,
                "has_more": False,
                "format": "csv"
            }
        
        # 分页读取：skiprows 需要跳过表头后的 offset 行
        # skiprows=range(1, offset + 1) 表示跳过第 1 到 offset 行 (0-indexed，第0行是表头)
        if offset > 0:
            df = pd.read_csv(path, skiprows=range(1, offset + 1), nrows=limit)
        else:
            df = pd.read_csv(path, nrows=limit)
        
        records = df.to_dict(orient="records")
        
        return {
            "data": records,
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": offset + limit < total,
            "format": "csv"
        }
    
    @classmethod
    def _read_text_paginated(cls, path: Path, offset: int, limit: int) -> Dict[str, Any]:
        """
        分页读取纯文本文件 (按行分页)
        """
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        total = len(lines)
        sliced_lines = lines[offset : offset + limit]
        
        return {
            "data": "".join(sliced_lines),
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": offset + limit < total,
            "format": "text"
        }

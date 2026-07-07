"""
购买记录管理器

负责记录和查询用户的数据集购买状态
存储路径: $LIBRECHAT_USER_DATA_DIR/{user_id}/purchases.json

创建日期: 2026-01-17
"""

import json
import logging
from pathlib import Path
from typing import List, Optional, Set
from datetime import datetime

from src.server.utils.storage_paths import STORAGE_ROOT

logger = logging.getLogger(__name__)


def normalize_filename(filename: str) -> str:
    """
    标准化文件名：去除路径、统一小写、去除后缀

    Examples:
        "File.CSV" -> "file"
        "path/to/File.csv" -> "file"
        "file" -> "file"
    """
    return Path(filename).stem.lower()


class PurchaseManager:
    """用户购买记录管理器"""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir) if base_dir else STORAGE_ROOT

    def _get_user_purchase_file(self, user_id: str) -> Path:
        """获取用户购买记录文件路径"""
        user_dir = self.base_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / "purchases.json"

    def _load_purchases(self, user_id: str) -> Set[str]:
        """加载用户购买记录"""
        purchase_file = self._get_user_purchase_file(user_id)

        if not purchase_file.exists():
            return set()

        try:
            with open(purchase_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get("purchased_files", []))
        except Exception as e:
            logger.error(f"Failed to load purchases for user {user_id}: {e}")
            return set()

    def _save_purchases(self, user_id: str, purchased_files: Set[str]) -> bool:
        """保存用户购买记录"""
        purchase_file = self._get_user_purchase_file(user_id)

        try:
            data = {
                "purchased_files": list(purchased_files),
                "last_updated": datetime.now().isoformat()
            }

            with open(purchase_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info(f"Saved purchases for user {user_id}: {len(purchased_files)} files")
            return True
        except Exception as e:
            logger.error(f"Failed to save purchases for user {user_id}: {e}")
            return False

    def is_purchased(self, user_id: str, filename: str) -> bool:
        """
        检查文件是否已购买

        Args:
            user_id: 用户ID
            filename: 文件名（可以带或不带.csv后缀、大小写不敏感）

        Returns:
            bool: 是否已购买
        """
        # 标准化文件名（去除路径、统一小写、去除后缀）
        clean_filename = normalize_filename(filename)

        purchased = self._load_purchases(user_id)
        result = clean_filename in purchased

        logger.debug(f"Check purchased: user={user_id}, file={clean_filename}, result={result}")
        return result

    def mark_as_purchased(self, user_id: str, filename: str) -> bool:
        """
        标记文件为已购买

        Args:
            user_id: 用户ID
            filename: 文件名

        Returns:
            bool: 是否成功
        """
        clean_filename = normalize_filename(filename)

        purchased = self._load_purchases(user_id)
        purchased.add(clean_filename)

        success = self._save_purchases(user_id, purchased)

        if success:
            logger.info(f"Marked as purchased: user={user_id}, file={clean_filename}")

        return success

    def batch_mark_purchased(self, user_id: str, filenames: List[str]) -> bool:
        """
        批量标记文件为已购买

        Args:
            user_id: 用户ID
            filenames: 文件名列表

        Returns:
            bool: 是否成功
        """
        clean_filenames = [normalize_filename(f) for f in filenames]

        purchased = self._load_purchases(user_id)
        purchased.update(clean_filenames)

        success = self._save_purchases(user_id, purchased)

        if success:
            logger.info(f"Batch marked as purchased: user={user_id}, count={len(clean_filenames)}")

        return success

    def get_purchased_files(self, user_id: str) -> List[str]:
        """
        获取用户所有已购买的文件列表

        Args:
            user_id: 用户ID

        Returns:
            List[str]: 已购买的文件名列表
        """
        purchased = self._load_purchases(user_id)
        return list(purchased)

    def unmark_purchased(self, user_id: str, filenames: List[str]) -> bool:
        """
        撤销购买标记（用于下载失败时回滚）

        Args:
            user_id: 用户ID
            filenames: 文件名列表

        Returns:
            bool: 是否成功
        """
        clean_filenames = [normalize_filename(f) for f in filenames]

        purchased = self._load_purchases(user_id)
        # 移除指定文件
        for filename in clean_filenames:
            purchased.discard(filename)

        success = self._save_purchases(user_id, purchased)

        if success:
            logger.info(f"Unmarked purchased: user={user_id}, count={len(clean_filenames)}")

        return success


# 全局单例
_purchase_manager: PurchaseManager | None = None


def get_purchase_manager() -> PurchaseManager:
    """获取全局购买记录管理器单例"""
    global _purchase_manager
    if _purchase_manager is None:
        _purchase_manager = PurchaseManager()
    return _purchase_manager

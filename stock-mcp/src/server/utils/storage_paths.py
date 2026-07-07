"""Shared local storage paths for stock-mcp and LibreChat data files."""

import os
from pathlib import Path


DEFAULT_STORAGE_ROOT = Path(__file__).resolve().parents[4] / "librechat_user_data"


def get_storage_root() -> Path:
    """Return the user data storage root, configurable via LIBRECHAT_USER_DATA_DIR."""
    return Path(os.getenv("LIBRECHAT_USER_DATA_DIR", str(DEFAULT_STORAGE_ROOT))).expanduser().resolve()


STORAGE_ROOT = get_storage_root()
STORAGE_ROOT_STR = str(STORAGE_ROOT)


def user_storage_path(user_id: str, *parts: str) -> Path:
    """Build a path under a user's isolated storage directory."""
    return STORAGE_ROOT.joinpath(str(user_id), *parts)

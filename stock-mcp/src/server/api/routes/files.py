# src/server/api/routes/files.py
"""
文件管理 API 路由

提供以下接口:
- GET /api/v1/files/dataset: 列出用户的所有数据集
- GET /api/v1/files/preview/{filename}: 获取数据集预览
- DELETE /api/v1/files/dataset/{filename}: 删除数据集
- GET /api/v1/files/download/{filename}: 下载数据集文件

所有接口均需要用户认证（通过 X-User-Id header）

创建日期: 2026-01-13
"""

import os
import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.server.core.dataset_manager import get_dataset_manager
from src.server.core.purchase_manager import get_purchase_manager
from src.server.utils.request_context import get_current_user_id

# 配置日志
logger = logging.getLogger(__name__)

# 创建路由器
router = APIRouter(prefix="/api/v1/files", tags=["Files"])

# 调试模式
DEBUG_MODE = os.getenv("FILES_API_DEBUG", "false").lower() == "true"


# ============ Pydantic Models ============

class MarkPurchasedRequest(BaseModel):
    """标记购买请求体"""
    filenames: List[str]


class CheckPurchasedResponse(BaseModel):
    """购买状态检查响应"""
    filename: str
    is_purchased: bool


# ============ Helper Functions ============

def _debug_log(message: str, **kwargs):
    """调试日志"""
    if DEBUG_MODE:
        extra = " | ".join(f"{k}={v}" for k, v in kwargs.items())
        logger.info(f"[FilesAPI DEBUG] {message} | {extra}")


def _require_user_id(request: Request) -> str:
    """
    获取并验证用户ID
    
    Args:
        request: FastAPI Request 对象
        
    Returns:
        str: 用户ID
        
    Raises:
        HTTPException: 如果未找到用户ID（401 Unauthorized）
    """
    # 优先从 HTTP header 中获取（直接访问，不依赖中间件）
    user_id = request.headers.get('X-User-Id') or request.headers.get('x-user-id')
    
    # Fallback: 从上下文变量中获取
    if not user_id:
        user_id = get_current_user_id()
    
    if not user_id:
        logger.warning("Unauthorized request: missing X-User-Id header")
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: X-User-Id header required"
        )
    return user_id


@router.get("/dataset")
async def list_datasets(request: Request) -> List[Dict[str, Any]]:
    """
    列出当前用户的所有数据集
    
    返回格式:
    [
        {
            "id": "BABA_2023_Stock_Data",
            "filename": "BABA_2023_Stock_Data.csv",
            "name": "BABA_2023_Stock_Data.csv",
            "rows": 1200,
            "cols": 7,
            "category": "Stock",
            "stats": {...},
            "created_at": "2026-01-13T10:00:00",
            "size_formatted": "1.5 MB"
        },
        ...
    ]
    """
    user_id = _require_user_id(request)
    _debug_log("List datasets request", user_id=user_id)
    
    try:
        manager = get_dataset_manager()
        datasets = manager.list_datasets(user_id)
        
        _debug_log("Datasets listed successfully", count=len(datasets))
        return datasets
        
    except Exception as e:
        logger.error(f"Failed to list datasets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list datasets: {str(e)}"
        )


@router.get("/preview/{filename}")
async def preview_dataset(filename: str, request: Request) -> Dict[str, Any]:
    """
    获取数据集预览

    返回格式:
    {
        "success": true,
        "meta": {
            "filename": "...",
            "rows": 1200,
            "cols": 7,
            "stats": { "Min": 2856.34, ... }
        },
        "chart_points": [{"x": "2023-01-01", "y": 3000.5}, ...],
        "head_rows": [[...], [...], ...],
        "columns": ["date", "open", "high", "low", "close", "volume"]
    }
    """
    user_id = _require_user_id(request)
    _debug_log("Preview dataset request", user_id=user_id, filename=filename)

    try:
        manager = get_dataset_manager()
        result = manager.get_dataset_preview(user_id, filename)

        # 如果用户文件不存在，尝试从 anonymous 用户获取模拟数据
        if not result.get("success") and filename == "NVDA_Half_Year_Prices_202507_202601.csv":
            logger.info(f"User {user_id} file not found, falling back to anonymous mock data: {filename}")
            result = manager.get_dataset_preview("anonymous", filename)

        if not result.get("success"):
            raise HTTPException(
                status_code=404,
                detail=result.get("error", "Dataset not found")
            )

        _debug_log("Preview generated successfully", filename=filename)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to preview dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to preview dataset: {str(e)}"
        )


@router.delete("/dataset/{filename}")
async def delete_dataset(filename: str, request: Request) -> Dict[str, str]:
    """
    删除数据集（物理删除 CSV 和元数据文件）
    
    **警告**: 此操作不可恢复
    
    返回:
    {
        "message": "删除成功"
    }
    """
    user_id = _require_user_id(request)
    _debug_log("Delete dataset request", user_id=user_id, filename=filename)
    
    try:
        manager = get_dataset_manager()
        result = manager.delete_dataset(user_id, filename)
        
        if not result.get("success"):
            error = result.get("error", "Failed to delete")
            if "not found" in error.lower():
                raise HTTPException(status_code=404, detail=error)
            raise HTTPException(status_code=500, detail=error)
        
        logger.info(f"Dataset deleted by user {user_id}: {filename}")
        _debug_log("Delete successful", filename=filename)
        
        return {"message": "删除成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete dataset: {str(e)}"
        )


@router.get("/download/{filename}")
async def download_dataset(filename: str, request: Request) -> FileResponse:
    """
    下载数据集文件

    返回 CSV 文件流

    注意: 需要先通过购买检查，未购买的文件将被拒绝下载
    """
    user_id = _require_user_id(request)
    _debug_log("Download dataset request", user_id=user_id, filename=filename)

    try:
        # 检查购买状态（模拟数据除外）
        if filename != "NVDA_Half_Year_Prices_202507_202601.csv":
            purchase_mgr = get_purchase_manager()
            if not purchase_mgr.is_purchased(user_id, filename):
                logger.warning(f"User {user_id} attempted to download unpurchased file: {filename}")
                raise HTTPException(
                    status_code=403,
                    detail="此文件未购买，请先完成购买"
                )

        manager = get_dataset_manager()

        # 清理文件名并构建路径
        safe_filename = manager._sanitize_filename(filename)
        user_dir = manager._get_user_dataset_dir(user_id)
        csv_path = user_dir / f"{safe_filename}.csv"

        # 安全检查：确保路径在用户目录内
        try:
            csv_path.resolve().relative_to(user_dir.resolve())
        except ValueError:
            logger.warning(f"Path traversal attempt: {filename} by user {user_id}")
            raise HTTPException(status_code=400, detail="Invalid filename")

        # 检查文件存在，如果不存在且是 NVDA 模拟数据，则从 anonymous 用户获取
        if not csv_path.exists():
            if filename == "NVDA_Half_Year_Prices_202507_202601.csv":
                logger.info(f"User {user_id} file not found, falling back to anonymous mock data: {filename}")
                # 从 anonymous 用户目录获取
                anonymous_dir = manager._get_user_dataset_dir("anonymous")
                csv_path = anonymous_dir / f"{safe_filename}.csv"

                if not csv_path.exists():
                    raise HTTPException(status_code=404, detail="Mock data file not found")
            else:
                raise HTTPException(status_code=404, detail="File not found")

        _debug_log("Sending file", path=str(csv_path))

        return FileResponse(
            path=str(csv_path),
            filename=f"{safe_filename}.csv",
            media_type="text/csv"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to download dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download: {str(e)}"
        )


@router.post("/mark-purchased")
async def mark_purchased(request: Request, body: MarkPurchasedRequest) -> Dict[str, Any]:
    """
    标记文件为已购买（前端扣费成功后调用）

    请求体:
    {
        "filenames": ["file1.csv", "file2.csv"]
    }

    返回:
    {
        "success": true,
        "message": "已标记 2 个文件为已购买",
        "marked_count": 2
    }
    """
    user_id = _require_user_id(request)
    filenames = body.filenames

    _debug_log("Mark purchased request", user_id=user_id, count=len(filenames))

    if not filenames:
        raise HTTPException(status_code=400, detail="文件名列表不能为空")

    try:
        purchase_mgr = get_purchase_manager()
        success = purchase_mgr.batch_mark_purchased(user_id, filenames)

        if not success:
            raise HTTPException(status_code=500, detail="标记购买状态失败")

        logger.info(f"Marked {len(filenames)} files as purchased for user {user_id}")

        return {
            "success": True,
            "message": f"已标记 {len(filenames)} 个文件为已购买",
            "marked_count": len(filenames)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to mark purchased: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"标记购买失败: {str(e)}"
        )


@router.get("/check-purchased/{filename}")
async def check_purchased(filename: str, request: Request) -> CheckPurchasedResponse:
    """
    检查文件是否已购买

    返回:
    {
        "filename": "file1.csv",
        "is_purchased": true
    }
    """
    user_id = _require_user_id(request)
    _debug_log("Check purchased request", user_id=user_id, filename=filename)

    try:
        # 模拟数据永远视为已购买
        if filename == "NVDA_Half_Year_Prices_202507_202601.csv":
            return CheckPurchasedResponse(filename=filename, is_purchased=True)

        purchase_mgr = get_purchase_manager()
        is_purchased = purchase_mgr.is_purchased(user_id, filename)

        return CheckPurchasedResponse(filename=filename, is_purchased=is_purchased)

    except Exception as e:
        logger.error(f"Failed to check purchased: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"检查购买状态失败: {str(e)}"
        )


@router.post("/unmark-purchased")
async def unmark_purchased(request: Request, body: MarkPurchasedRequest) -> Dict[str, Any]:
    """
    撤销购买标记（用于下载失败时回滚）

    请求体:
    {
        "filenames": ["file1.csv", "file2.csv"]
    }

    返回:
    {
        "success": true,
        "message": "已撤销 2 个文件的购买标记"
    }
    """
    user_id = _require_user_id(request)
    filenames = body.filenames

    _debug_log("Unmark purchased request", user_id=user_id, count=len(filenames))

    if not filenames:
        raise HTTPException(status_code=400, detail="文件名列表不能为空")

    try:
        purchase_mgr = get_purchase_manager()
        success = purchase_mgr.unmark_purchased(user_id, filenames)

        if not success:
            raise HTTPException(status_code=500, detail="撤销购买标记失败")

        logger.info(f"Unmarked {len(filenames)} files for user {user_id}")

        return {
            "success": True,
            "message": f"已撤销 {len(filenames)} 个文件的购买标记"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to unmark purchased: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"撤销购买标记失败: {str(e)}"
        )

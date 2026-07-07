"""数据预处理API路由"""

from fastapi import APIRouter, HTTPException
from typing import Optional, Literal
from pydantic import BaseModel
import pandas as pd
import os
from src.server.domain.services.data_preprocessing_service import DataPreprocessingService
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger
from src.server.utils.storage_paths import STORAGE_ROOT_STR

router = APIRouter(prefix="/api/preprocessing", tags=["preprocessing"])

# ===== 请求模型 =====

class CleanDataRequest(BaseModel):
    """数据清洗请求"""
    filename: str  # 用户数据目录中的文件名
    value_col: str = "close_price"
    timestamp_col: str = "timestamp"

class TransformRequest(BaseModel):
    """数据转换请求"""
    filename: str  # 已清洗的文件名
    transform_type: Literal["log", "log1p", "diff", "diff2"]
    value_col: str = "close_price"

class PreprocessingResponse(BaseModel):
    """预处理响应"""
    success: bool
    saved_path: Optional[str] = None
    processing_record: Optional[dict] = None
    error: Optional[str] = None

# ===== API端点 =====

@router.post("/clean", response_model=PreprocessingResponse)
async def clean_data(request: CleanDataRequest):
    """
    数据清洗接口

    功能：
    1. 读取用户原始数据
    2. 填充缺失值（ffill）
    3. 检测并填充异常值（3σ法则）
    4. 保存到processed目录

    Args:
        request: 包含文件名和列名的请求

    Returns:
        处理结果和保存路径
    """
    try:
        user_id = get_current_user_id() or "anonymous"

        # 读取原始数据
        input_path = f"{STORAGE_ROOT_STR}/{user_id}/dataset/{request.filename}"
        if not os.path.exists(input_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {request.filename}")

        df = pd.read_csv(input_path)

        # 执行清洗
        service = DataPreprocessingService()
        cleaned_df, record = service.clean_data(
            df,
            value_col=request.value_col,
            timestamp_col=request.timestamp_col
        )

        # 保存清洗后的数据
        output_dir = f"{STORAGE_ROOT_STR}/{user_id}/processed"
        os.makedirs(output_dir, exist_ok=True)

        # 文件名添加_cleaned后缀
        base_name = request.filename.replace('.csv', '')
        output_path = os.path.join(output_dir, f"{base_name}_cleaned.csv")
        cleaned_df.to_csv(output_path, index=False, encoding='utf-8-sig')

        logger.info(f"数据清洗完成: {output_path}")

        return PreprocessingResponse(
            success=True,
            saved_path=output_path,
            processing_record=record
        )

    except Exception as e:
        logger.error(f"数据清洗失败: {e}")
        return PreprocessingResponse(
            success=False,
            error=str(e)
        )

@router.post("/transform", response_model=PreprocessingResponse)
async def transform_data(request: TransformRequest):
    """
    数据转换接口

    功能：
    1. 对数转换（log, log1p）
    2. 差分转换（diff, diff2）

    Args:
        request: 包含文件名和转换类型的请求

    Returns:
        转换结果和保存路径
    """
    try:
        user_id = get_current_user_id() or "anonymous"

        # 读取已清洗的数据
        input_path = f"{STORAGE_ROOT_STR}/{user_id}/processed/{request.filename}"
        if not os.path.exists(input_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {request.filename}")

        df = pd.read_csv(input_path)

        # 执行转换
        service = DataPreprocessingService()

        if request.transform_type in ["log", "log1p"]:
            transformed_df, record = service.apply_log_transform(
                df,
                value_col=request.value_col,
                log_type=request.transform_type
            )
            suffix = f"_{request.transform_type}"

        elif request.transform_type in ["diff", "diff2"]:
            order = 1 if request.transform_type == "diff" else 2
            transformed_df, record = service.apply_diff(
                df,
                value_col=request.value_col,
                order=order
            )
            suffix = f"_diff{order}"

        else:
            raise HTTPException(status_code=400, detail=f"未知的转换类型: {request.transform_type}")

        # 保存转换后的数据
        base_name = request.filename.replace('.csv', '')
        output_path = f"{STORAGE_ROOT_STR}/{user_id}/processed/{base_name}{suffix}.csv"
        transformed_df.to_csv(output_path, index=False, encoding='utf-8-sig')

        logger.info(f"数据转换完成: {output_path}")

        return PreprocessingResponse(
            success=True,
            saved_path=output_path,
            processing_record=record
        )

    except Exception as e:
        logger.error(f"数据转换失败: {e}")
        return PreprocessingResponse(
            success=False,
            error=str(e)
        )

@router.get("/stats/{filename}")
async def get_statistics(filename: str, value_col: str = "close_price"):
    """
    获取数据的描述性统计

    Args:
        filename: 文件名（在dataset目录中）
        value_col: 数据列名

    Returns:
        统计指标字典
    """
    try:
        user_id = get_current_user_id() or "anonymous"

        # 优先从dataset目录读取（原始数据），若不存在则从processed读取（预处理后数据）
        file_path = f"{STORAGE_ROOT_STR}/{user_id}/dataset/{filename}"
        if not os.path.exists(file_path):
            file_path = f"{STORAGE_ROOT_STR}/{user_id}/processed/{filename}"

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

        df = pd.read_csv(file_path)

        service = DataPreprocessingService()
        stats = service.get_descriptive_stats(df, value_col=value_col)

        return {
            "success": True,
            "filename": filename,
            "statistics": stats
        }

    except Exception as e:
        logger.error(f"获取统计数据失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

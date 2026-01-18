"""报告生成API路由"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import json
from src.server.domain.services.report_generator import ReportGenerator
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/reports", tags=["reports"])

class ReportRequest(BaseModel):
    """报告生成请求"""
    report_id: str  # 报告ID（与模型构建时生成的report_id一致）
    preprocessing_record: Dict[str, Any]
    test_results: Dict[str, Any]
    descriptive_stats: Dict[str, Any]  # ✅ 支持单变量Dict[str, float]和多变量Dict[str, Dict[str, float]]
    data_source_info: Dict[str, Any]  # ✅ 修改：允许数字类型（original_count），与其他字段保持一致
    model_type: str

@router.post("/generate")
async def generate_report(request: ReportRequest):
    """生成学术报告（在已有的report_id目录中）"""
    try:
        user_id = get_current_user_id() or "anonymous"

        # 报告目录路径（模型结果已在此目录）
        report_dir = f"/root/librechat_user_data/{user_id}/reports/{request.report_id}"

        if not os.path.exists(report_dir):
            raise HTTPException(status_code=404, detail=f"报告目录不存在: {request.report_id}")

        # 读取模型结果（从report_id目录中）
        model_result_path = os.path.join(report_dir, "model_result.json")
        if not os.path.exists(model_result_path):
            raise HTTPException(status_code=404, detail="模型结果文件不存在")

        with open(model_result_path, 'r', encoding='utf-8') as f:
            model_result = json.load(f)

        # 使用ReportGenerator生成报告（传入report_dir）
        generator = ReportGenerator(report_dir)
        report_path = generator.generate_report(
            model_result=model_result,
            preprocessing_record=request.preprocessing_record,
            test_results=request.test_results,
            descriptive_stats=request.descriptive_stats,
            data_source_info=request.data_source_info,
            model_type=request.model_type
        )

        return {
            "success": True,
            "report_id": request.report_id,
            "report_path": report_path,
            "message": "报告生成成功"
        }

    except Exception as e:
        logger.error(f"报告生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
async def list_reports():
    """获取用户所有报告列表"""
    try:
        user_id = get_current_user_id() or "anonymous"
        reports_base_dir = f"/root/librechat_user_data/{user_id}/reports"

        if not os.path.exists(reports_base_dir):
            return {"success": True, "reports": []}

        reports = []
        for report_id in os.listdir(reports_base_dir):
            report_dir = os.path.join(reports_base_dir, report_id)
            if not os.path.isdir(report_dir):
                continue

            meta_path = os.path.join(report_dir, "meta.json")
            if os.path.exists(meta_path):
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    # 过滤掉已删除的报告
                    if meta.get("status") != "deleted":
                        reports.append({
                            "report_id": report_id,
                            "report_name": meta.get("report_name", report_id),
                            "model_type": meta.get("model_type", "-"),
                            "data_source": meta.get("data_source", "-"),
                            "created_at": meta.get("created_at", 0),
                            "metrics": meta.get("metrics", {})
                        })

        # 按创建时间倒序排列
        reports.sort(key=lambda x: x["created_at"], reverse=True)

        return {
            "success": True,
            "reports": reports
        }

    except Exception as e:
        logger.error(f"获取报告列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{report_id}")
async def delete_report(report_id: str):
    """软删除报告（标记为已删除，不实际删除文件）"""
    try:
        user_id = get_current_user_id() or "anonymous"
        report_dir = f"/root/librechat_user_data/{user_id}/reports/{report_id}"
        meta_path = os.path.join(report_dir, "meta.json")

        if not os.path.exists(meta_path):
            raise HTTPException(status_code=404, detail="报告不存在")

        # 读取meta.json
        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)

        # 标记为已删除
        meta["status"] = "deleted"
        meta["deleted_at"] = int(__import__('time').time())

        # 保存更新后的meta.json
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        return {
            "success": True,
            "message": "报告已删除"
        }

    except Exception as e:
        logger.error(f"删除报告失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}/details")
async def get_report_details(report_id: str):
    """获取报告详细信息（包含完整模型结果）"""
    try:
        user_id = get_current_user_id() or "anonymous"
        report_dir = f"/root/librechat_user_data/{user_id}/reports/{report_id}"

        # 读取meta.json
        meta_path = os.path.join(report_dir, "meta.json")
        if not os.path.exists(meta_path):
            raise HTTPException(status_code=404, detail="报告不存在")

        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)

        # 读取model_result.json
        model_result_path = os.path.join(report_dir, "model_result.json")
        model_result = None
        if os.path.exists(model_result_path):
            with open(model_result_path, 'r', encoding='utf-8') as f:
                model_result = json.load(f)

        return {
            "success": True,
            "report_id": report_id,
            "meta": meta,
            "model_result": model_result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取报告详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{report_id}/report.docx")
async def download_report(report_id: str):
    """下载报告DOCX文件"""
    try:
        user_id = get_current_user_id() or "anonymous"
        file_path = f"/root/librechat_user_data/{user_id}/reports/{report_id}/report.docx"

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="报告文件不存在")

        return FileResponse(
            path=file_path,
            filename=f"{report_id}.docx",
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

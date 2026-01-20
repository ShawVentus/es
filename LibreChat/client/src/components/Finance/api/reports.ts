/**
 * 金融模块 - 报告管理 API 客户端
 *
 * 提供报告生成、列表查询、删除、下载功能
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import type { AuthInfo } from './dataset';

const API_BASE_URL = 'http://localhost:9898';
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

function debugLog(message: string, ...args: unknown[]) {
    if (DEBUG) {
        console.log(`[Finance/ReportsAPI] ${message}`, ...args);
    }
}

/**
 * 通用请求函数
 */
async function apiRequest<T>(auth: AuthInfo, endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!auth.isAuthenticated || !auth.user?.id) {
        throw new Error('未登录：请先登录后再使用本系统');
    }

    debugLog('Request:', endpoint);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': auth.token ? `Bearer ${auth.token}` : '',
            'X-User-Id': auth.user.id,
            ...options.headers
        }
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail || errorData, null, 2);
        throw new Error(errorMessage || `API请求失败: ${response.status}`);
    }

    return response.json();
}

// ========== 类型定义 ==========

export interface ReportMeta {
    report_id: string;
    report_name: string;
    model_type: string;
    data_source: string;
    created_at: number;
    metrics: {
        aic?: number;
        bic?: number;
        r2?: number;
    };
}

export interface ReportGenerateParams {
    report_id: string;
    preprocessing_record: unknown;
    test_results: unknown;
    descriptive_stats: unknown;
    data_source_info: {
        name: string;
        source: string;
        fetch_time?: string;
        date_range?: string;
        original_count?: number;
    };
    model_type: string;
}

export interface ReportGenerateResult {
    success: boolean;
    report_id: string;
    report_path: string;
    message: string;
}

export interface ReportListResult {
    success: boolean;
    reports: ReportMeta[];
}

export interface DeleteReportResult {
    success: boolean;
    message: string;
}

export interface ReportDetailsResult {
    success: boolean;
    report_id: string;
    meta: unknown;
    model_result: unknown;
}

// ========== API函数 ==========

export async function generateReport(auth: AuthInfo, params: ReportGenerateParams): Promise<ReportGenerateResult> {
    debugLog('generateReport 请求参数:', JSON.stringify(params, null, 2));
    return apiRequest<ReportGenerateResult>(auth, '/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify(params)
    });
}

export async function listReports(auth: AuthInfo): Promise<ReportListResult> {
    return apiRequest<ReportListResult>(auth, '/api/reports/list', {
        method: 'GET'
    });
}

export async function deleteReport(auth: AuthInfo, reportId: string): Promise<DeleteReportResult> {
    return apiRequest<DeleteReportResult>(auth, `/api/reports/${reportId}`, {
        method: 'DELETE'
    });
}

export async function getReportDetails(auth: AuthInfo, reportId: string): Promise<ReportDetailsResult> {
    return apiRequest<ReportDetailsResult>(auth, `/api/reports/${reportId}/details`, {
        method: 'GET'
    });
}

export function getReportDownloadUrl(reportId: string): string {
    return `${API_BASE_URL}/api/reports/download/${reportId}/report.docx`;
}

export async function downloadReportFile(auth: AuthInfo, reportId: string): Promise<void> {
    if (!auth.isAuthenticated || !auth.user?.id) {
        throw new Error('未登录：请先登录后再使用本系统');
    }

    try {
        const url = getReportDownloadUrl(reportId);
        const response = await fetch(url, {
            headers: {
                'X-User-Id': auth.user.id
            }
        });

        if (!response.ok) {
            throw new Error(`下载失败: ${response.status}`);
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${reportId}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('下载报告失败:', error);
        throw error;
    }
}

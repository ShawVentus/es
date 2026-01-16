/**
 * 报告管理API客户端
 *
 * 提供报告生成、列表查询、删除、下载功能
 */

const API_BASE_URL = 'http://localhost:9898';

/**
 * 获取当前用户ID
 */
function getCurrentUserId(): string {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id || user.email || 'anonymous';
    }
  } catch (e) {
    console.warn('Failed to get user ID:', e);
  }
  return 'anonymous';
}

/**
 * 通用请求函数
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getCurrentUserId(),
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `API请求失败: ${response.status}`);
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
  preprocessing_record: any;
  test_results: any;
  descriptive_stats: any;
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

// ========== API函数 ==========

/**
 * 生成报告（在已有的report_id目录中）
 * @param params - 报告生成参数
 * @returns 生成结果
 */
export async function generateReport(params: ReportGenerateParams): Promise<ReportGenerateResult> {
  return apiRequest<ReportGenerateResult>('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 获取报告列表
 * @returns 报告列表
 */
export async function listReports(): Promise<ReportListResult> {
  return apiRequest<ReportListResult>('/api/reports/list', {
    method: 'GET'
  });
}

/**
 * 软删除报告
 * @param reportId - 报告ID
 * @returns 删除结果
 */
export async function deleteReport(reportId: string): Promise<DeleteReportResult> {
  return apiRequest<DeleteReportResult>(`/api/reports/${reportId}`, {
    method: 'DELETE'
  });
}

/**
 * 下载报告DOCX文件
 * @param reportId - 报告ID
 * @returns 下载URL（浏览器会自动下载）
 */
export function getReportDownloadUrl(reportId: string): string {
  return `${API_BASE_URL}/api/reports/download/${reportId}/report.docx`;
}

/**
 * 触发报告下载
 * @param reportId - 报告ID
 */
export function downloadReport(reportId: string): void {
  const url = getReportDownloadUrl(reportId);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportId}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

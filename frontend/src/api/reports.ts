/**
 * 报告管理API客户端
 *
 * 提供报告生成、列表查询、删除、下载功能
 */

// 开发模式和生产模式都使用相对路径
// 开发模式：通过Vite proxy转发
// 生产模式：通过nginx反向代理转发
const API_BASE_URL = '';

/**
 * 获取当前用户ID
 */
export function getCurrentUserId(): string {
  const userStr = localStorage.getItem('librechat_user');

  if (!userStr) {
    throw new Error('未登录：请先访问 LibreChat (/librechat) 登录后再使用本系统');
  }

  try {
    const user = JSON.parse(userStr);
    const userId = user?.id;  // 强制使用 ObjectId

    if (!userId) {
      throw new Error('用户信息不完整：无法获取用户 ID 或邮箱');
    }

    return userId;
  } catch (e) {
    if (e instanceof Error && e.message.includes('用户信息不完整')) {
      throw e;
    }
    throw new Error('用户信息解析失败：localStorage 数据格式错误');
  }
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
    // 处理 FastAPI 的验证错误（detail 可能是数组或对象）
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

export interface ReportDetailsResult {
  success: boolean;
  report_id: string;
  meta: any;
  model_result: any;
}

// ========== API函数 ==========

/**
 * 生成报告（在已有的report_id目录中）
 * @param params - 报告生成参数
 * @returns 生成结果
 */
export async function generateReport(params: ReportGenerateParams): Promise<ReportGenerateResult> {
  // 调试日志：输出实际发送的参数
  console.log('[Debug] generateReport 请求参数:', JSON.stringify(params, null, 2));

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
 * 获取报告详细信息（包含完整模型结果）
 * @param reportId - 报告ID
 * @returns 报告详细信息
 */
export async function getReportDetails(reportId: string): Promise<ReportDetailsResult> {
  return apiRequest<ReportDetailsResult>(`/api/reports/${reportId}/details`, {
    method: 'GET'
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
 * 下载报告DOCX文件（使用fetch支持header传递）
 * @param reportId - 报告ID
 */
export async function downloadReportFile(reportId: string): Promise<void> {
  try {
    const url = getReportDownloadUrl(reportId);
    const response = await fetch(url, {
      headers: {
        'X-User-Id': getCurrentUserId()
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

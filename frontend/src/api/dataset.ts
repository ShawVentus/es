/**
 * 数据集 API 客户端
 * 
 * 封装与后端 /api/v1/files/* 接口的通信逻辑
 * 自动附加 Bearer Token 进行鉴权
 * 
 * 创建日期: 2026-01-13
 */

// 后端 API 基础地址
// 开发模式和生产模式都使用相对路径
// 开发模式：通过Vite proxy转发
// 生产模式：通过nginx反向代理转发
const API_BASE_URL = '';

// 调试模式
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true';

function debugLog(message: string, ...args: unknown[]) {
    if (DEBUG) {
        console.log(`[DatasetAPI] ${message}`, ...args);
    }
}

/**
 * 数据集元数据接口
 */
export interface DatasetMeta {
    id: string;
    filename: string;
    name: string;
    rows: number;
    cols: number;
    size?: number;
    category: string;
    stats: {
        Min: number;
        Max: number;
        Mean: number;
        Median: number;
        'Std.Dev': number;
        Skewness: number;
        Kurtosis: number;
    };
    created_at: string;
    size_formatted: string;
    columns?: string[];
}

/**
 * 数据集预览数据接口
 */
export interface DatasetPreview {
    success: boolean;
    meta: DatasetMeta;
    chart_points: Array<{ x: string; y: number }>;
    head_rows: unknown[][];
    tail_rows?: unknown[][];
    columns: string[];
    total_rows: number;
    error?: string;
}

/**
 * 获取存储的 Token
 */
function getToken(): string | null {
    return localStorage.getItem('librechat_token');
}

/**
 * 构建请求头（含 Authorization 和 X-User-Id）
 *
 * 导出供其他模块使用（如 billing.ts）
 */
export function buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 从 localStorage 获取 user_id（LibreChat 登录后存储的）
    const userStr = localStorage.getItem('librechat_user');

    if (!userStr) {
        throw new Error('未登录：请先访问 LibreChat (http://localhost:3080) 登录后再使用本系统');
    }

    let userId: string;
    try {
        const user = JSON.parse(userStr);
        // 🔧 强制使用 ObjectId，确保与后端存储路径一致
        userId = user?.id;

        if (!userId) {
            // 清除旧的认证信息
            localStorage.removeItem('librechat_user');
            localStorage.removeItem('librechat_token');
            localStorage.setItem('librechat_auth', 'false');

            throw new Error(
                '用户信息已过期：缺少用户 ObjectId。\n' +
                '已自动清除旧数据，请重新访问 LibreChat (http://localhost:3080) 登录。\n' +
                '登录后请刷新本页面。'
            );
        }

        debugLog('User ID (ObjectId) from localStorage:', userId);
    } catch (e) {
        if (e instanceof Error && e.message.includes('用户信息已过期')) {
            throw e;
        }
        throw new Error('用户信息解析失败：localStorage 数据格式错误');
    }

    headers['X-User-Id'] = userId;

    return headers;
}

/**
 * 列出当前用户的所有数据集
 */
export async function listDatasets(): Promise<DatasetMeta[]> {
    debugLog('Fetching dataset list...');

    const response = await fetch(`${API_BASE_URL}/api/v1/files/dataset`, {
        method: 'GET',
        headers: buildHeaders(),
    });

    if (!response.ok) {
        const error = await response.text();
        debugLog('Failed to fetch datasets:', error);
        throw new Error(`Failed to fetch datasets: ${response.status}`);
    }

    const data = await response.json();
    debugLog('Datasets fetched:', data.length);
    return data;
}

/**
 * 获取数据集预览（统计量 + 趋势图 + 表头）
 */
export async function getDatasetPreview(filename: string): Promise<DatasetPreview> {
    debugLog('Fetching preview for:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/preview/${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers: buildHeaders(),
    });

    if (!response.ok) {
        const error = await response.text();
        debugLog('Failed to fetch preview:', error);
        throw new Error(`Failed to fetch preview: ${response.status}`);
    }

    return response.json();
}

/**
 * 删除数据集
 */
export async function deleteDataset(filename: string): Promise<{ message: string }> {
    debugLog('Deleting dataset:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/dataset/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: buildHeaders(),
    });

    if (!response.ok) {
        const error = await response.text();
        debugLog('Failed to delete dataset:', error);
        throw new Error(`Failed to delete: ${response.status}`);
    }

    return response.json();
}

/**
 * 下载数据集文件（返回 Blob）
 */
export async function downloadDataset(filename: string): Promise<Blob> {
    debugLog('Downloading dataset:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/download/${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers: buildHeaders(),
    });

    if (!response.ok) {
        const error = await response.text();
        debugLog('Failed to download dataset:', error);
        throw new Error(`Failed to download: ${response.status}`);
    }

    return response.blob();
}

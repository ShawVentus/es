/**
 * 数据集 API 客户端
 * 
 * 封装与后端 /api/v1/files/* 接口的通信逻辑
 * 自动附加 Bearer Token 进行鉴权
 * 
 * 创建日期: 2026-01-13
 */

// 后端 API 基础地址（从环境变量读取）
// VITE_STOCK_MCP_URL: stock-mcp 服务地址
// VITE_AGENT_URL: LibreChat 服务地址（用于 iframe）
const API_BASE_URL = import.meta.env.VITE_STOCK_MCP_URL || 'http://localhost:9898';

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
 */
function buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 从 localStorage 获取 user_id（LibreChat 登录后存储的）
    const userStr = localStorage.getItem('librechat_user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            // 优先使用 id，如果没有则使用 email 作为 fallback
            const userId = user?.id || user?.email;
            if (userId) {
                headers['X-User-Id'] = userId;
                debugLog('User ID from localStorage:', userId);
            } else {
                debugLog('Warning: No id or email found in user object:', user);
            }
        } catch (e) {
            debugLog('Error parsing user from localStorage:', e);
        }
    } else {
        debugLog('Warning: librechat_user not found in localStorage');
    }

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

/**
 * 金融模块 - 数据集 API 客户端
 * 
 * 封装与后端 /api/v1/files/* 接口的通信逻辑
 * 使用 LibreChat 的 useAuthContext 获取认证信息
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

// 后端 API 基础地址
const API_BASE_URL = 'http://localhost:9898';

// 调试模式
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

function debugLog(message: string, ...args: unknown[]) {
    if (DEBUG) {
        console.log(`[Finance/DatasetAPI] ${message}`, ...args);
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
 * 认证信息接口（从 useAuthContext 获取）
 */
export interface AuthInfo {
    token?: string;
    user?: {
        id?: string;
        name?: string;
        email?: string;
    };
    isAuthenticated: boolean;
}

/**
 * 构建请求头（含 Authorization 和 X-User-Id）
 * 
 * @param auth - 从 useAuthContext 获取的认证信息
 * @returns HTTP 请求头
 * @throws 认证错误时抛出异常
 */
export function buildHeaders(auth: AuthInfo): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    if (!auth.isAuthenticated) {
        throw new Error('未登录：请先登录后再使用本系统');
    }

    if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
    }

    const userId = auth.user?.id;
    if (!userId) {
        throw new Error('用户信息缺失：无法获取用户 ID');
    }

    headers['X-User-Id'] = userId;
    debugLog('Headers built with userId:', userId);

    return headers;
}

/**
 * 列出当前用户的所有数据集
 * 
 * @param auth - 认证信息
 * @returns 数据集列表
 */
export async function listDatasets(auth: AuthInfo): Promise<DatasetMeta[]> {
    debugLog('Fetching dataset list...');

    const response = await fetch(`${API_BASE_URL}/api/v1/files/dataset`, {
        method: 'GET',
        headers: buildHeaders(auth),
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
 * 
 * @param auth - 认证信息
 * @param filename - 文件名
 * @returns 数据集预览
 */
export async function getDatasetPreview(auth: AuthInfo, filename: string): Promise<DatasetPreview> {
    debugLog('Fetching preview for:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/preview/${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers: buildHeaders(auth),
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
 * 
 * @param auth - 认证信息
 * @param filename - 文件名
 * @returns 删除结果
 */
export async function deleteDataset(auth: AuthInfo, filename: string): Promise<{ message: string }> {
    debugLog('Deleting dataset:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/dataset/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: buildHeaders(auth),
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
 * 
 * @param auth - 认证信息
 * @param filename - 文件名
 * @returns 文件 Blob
 */
export async function downloadDataset(auth: AuthInfo, filename: string): Promise<Blob> {
    debugLog('Downloading dataset:', filename);

    const response = await fetch(`${API_BASE_URL}/api/v1/files/download/${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers: buildHeaders(auth),
    });

    if (!response.ok) {
        const error = await response.text();
        debugLog('Failed to download dataset:', error);
        throw new Error(`Failed to download: ${response.status}`);
    }

    return response.blob();
}

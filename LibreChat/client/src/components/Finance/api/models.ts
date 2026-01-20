/**
 * 金融模块 - 模型构建 API 客户端
 *
 * 提供6种时序模型的API调用函数：
 * - ARIMA/ARMA: 自回归移动平均模型
 * - GARCH/ARCH: 条件异方差模型
 * - VAR/VECM: 向量自回归模型
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import type { AuthInfo } from './dataset';

const API_BASE_URL = 'http://localhost:9898';
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

function debugLog(message: string, ...args: unknown[]) {
    if (DEBUG) {
        console.log(`[Finance/ModelsAPI] ${message}`, ...args);
    }
}

/**
 * 通用请求函数
 */
async function apiRequest<T>(auth: AuthInfo, endpoint: string, body: unknown): Promise<T> {
    if (!auth.isAuthenticated || !auth.user?.id) {
        throw new Error('未登录：请先登录后再使用本系统');
    }

    debugLog('Request:', endpoint);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': auth.token ? `Bearer ${auth.token}` : '',
            'X-User-Id': auth.user.id
        },
        body: JSON.stringify(body)
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

export interface ARIMAParams {
    filename: string;
    value_col: string;
    order?: [number, number, number];
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface ARMAParams {
    filename: string;
    value_col: string;
    order?: [number, number];
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface GARCHParams {
    filename: string;
    value_col: string;
    garch_order?: [number, number];
    mean_order?: [number, number];
    distribution?: 'normal' | 't' | 'ged';
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface ARCHParams {
    filename: string;
    value_col: string;
    garch_order?: [number];
    mean_order?: [number, number];
    distribution?: 'normal' | 't' | 'ged';
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface VARParams {
    filenames: string[];
    value_col: string;
    lags?: number;
    include_granger?: boolean;
    include_irf?: boolean;
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface VECMParams {
    filenames: string[];
    value_col: string;
    coint_rank?: number;
    lags?: number;
    include_granger?: boolean;
    include_irf?: boolean;
    start_date?: string;
    end_date?: string;
    date_col?: string;
}

export interface ModelResult {
    success: boolean;
    model_type: string;
    selected_order?: unknown;
    selected_lag?: number;
    parameters: unknown;
    metrics: {
        aic: number;
        bic: number;
        log_likelihood: number;
        r2?: number;
        r2_average?: number;
    };
    data: {
        original: number[] | Record<string, number[]>;
        fitted: number[] | Record<string, number[]>;
        residuals: number[] | Record<string, number[]>;
    };
    saved_path: string;
    report_id?: string;
    message?: string;
}

// ========== API函数 ==========

export async function fitARIMA(auth: AuthInfo, params: ARIMAParams): Promise<ModelResult> {
    return apiRequest<ModelResult>(auth, '/api/models/arima', params);
}

export async function fitARMA(auth: AuthInfo, params: ARMAParams): Promise<ModelResult> {
    const arimaParams: ARIMAParams = {
        filename: params.filename,
        value_col: params.value_col,
        order: params.order ? [params.order[0], 0, params.order[1]] : undefined
    };
    return apiRequest<ModelResult>(auth, '/api/models/arma', arimaParams);
}

export async function fitGARCH(auth: AuthInfo, params: GARCHParams): Promise<ModelResult> {
    return apiRequest<ModelResult>(auth, '/api/models/garch', params);
}

export async function fitARCH(auth: AuthInfo, params: ARCHParams): Promise<ModelResult> {
    return apiRequest<ModelResult>(auth, '/api/models/arch', params);
}

export async function fitVAR(auth: AuthInfo, params: VARParams): Promise<ModelResult> {
    return apiRequest<ModelResult>(auth, '/api/models/var', params);
}

export async function fitVECM(auth: AuthInfo, params: VECMParams): Promise<ModelResult> {
    return apiRequest<ModelResult>(auth, '/api/models/vecm', params);
}

/**
 * 金融模块 - 统计检验与描述性统计 API 客户端
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import type { AuthInfo } from './dataset';

const API_BASE_URL = 'http://localhost:9898';
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

function debugLog(message: string, ...args: unknown[]) {
    if (DEBUG) {
        console.log(`[Finance/StatisticsAPI] ${message}`, ...args);
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

export interface UnivariateTestResult {
    success: boolean;
    filename: string;
    column: string;
    n_observations: number;
    tests: {
        adf?: unknown;
        jb?: unknown;
        ljung_box?: unknown;
        arch_lm?: unknown;
    };
}

export interface DescriptiveStatsResult {
    success: boolean;
    filename: string;
    statistics: {
        count?: number;
        mean?: number;
        std?: number;
        min?: number;
        max?: number;
        skewness?: number;
        kurtosis?: number;
    };
}

export interface MultivariateTestResult {
    success: boolean;
    filenames: string[];
    column: string;
    n_observations: number;
    tests: {
        pearson_correlation?: unknown;
        vif?: unknown;
        johansen?: unknown;
        granger_causality?: unknown;
    };
}

// ========== API函数 ==========

export async function runUnivariateTests(auth: AuthInfo, params: {
    filename: string;
    value_col: string;
}): Promise<UnivariateTestResult> {
    return apiRequest<UnivariateTestResult>(auth, '/api/statistics/univariate', {
        method: 'POST',
        body: JSON.stringify(params)
    });
}

export async function getDescriptiveStats(
    auth: AuthInfo,
    filename: string,
    value_col: string
): Promise<DescriptiveStatsResult> {
    return apiRequest<DescriptiveStatsResult>(
        auth,
        `/api/preprocessing/stats/${encodeURIComponent(filename)}?value_col=${encodeURIComponent(value_col)}`,
        { method: 'GET' }
    );
}

export async function runMultivariateTests(auth: AuthInfo, params: {
    filenames: string[];
    value_col: string;
    date_col?: string;
}): Promise<MultivariateTestResult> {
    return apiRequest<MultivariateTestResult>(auth, '/api/statistics/multivariate', {
        method: 'POST',
        body: JSON.stringify(params)
    });
}

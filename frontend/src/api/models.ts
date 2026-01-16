/**
 * 模型构建API客户端
 *
 * 提供6种时序模型的API调用函数：
 * - ARIMA/ARMA: 自回归移动平均模型
 * - GARCH/ARCH: 条件异方差模型
 * - VAR/VECM: 向量自回归模型
 */

const API_BASE_URL = 'http://localhost:9898';

/**
 * 获取当前用户ID
 * 从localStorage获取LibreChat的用户信息
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
async function apiRequest<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getCurrentUserId()
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `API请求失败: ${response.status}`);
  }

  return response.json();
}

// ========== 类型定义 ==========

export interface ARIMAParams {
  filename: string;
  value_col: string;
  order?: [number, number, number];  // [p, d, q]
  start_date?: string;  // 起始日期，格式: YYYY-MM-DD
  end_date?: string;    // 结束日期，格式: YYYY-MM-DD
  date_col?: string;    // 日期列名，默认自动识别
}

export interface ARMAParams {
  filename: string;
  value_col: string;
  order?: [number, number];  // [p, q]
  start_date?: string;
  end_date?: string;
  date_col?: string;
}

export interface GARCHParams {
  filename: string;
  value_col: string;
  garch_order?: [number, number];  // [p, q]
  mean_order?: [number, number];   // [ar, ma]
  distribution?: 'normal' | 't' | 'ged';
  start_date?: string;
  end_date?: string;
  date_col?: string;
}

export interface ARCHParams {
  filename: string;
  value_col: string;
  garch_order?: [number];  // [q]
  mean_order?: [number, number];  // [ar, ma]
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
  selected_order?: any;
  selected_lag?: number;
  parameters: any;
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
  message?: string;
}

// ========== API函数 ==========

/**
 * 拟合ARIMA模型
 * @param params - ARIMA参数
 * @returns 模型结果
 */
export async function fitARIMA(params: ARIMAParams): Promise<ModelResult> {
  return apiRequest<ModelResult>('/api/models/arima', params);
}

/**
 * 拟合ARMA模型
 * @param params - ARMA参数
 * @returns 模型结果
 */
export async function fitARMA(params: ARMAParams): Promise<ModelResult> {
  // ARMA通过ARIMA端点实现，d=0
  const arimaParams: ARIMAParams = {
    filename: params.filename,
    value_col: params.value_col,
    order: params.order ? [params.order[0], 0, params.order[1]] : undefined
  };
  return apiRequest<ModelResult>('/api/models/arma', arimaParams);
}

/**
 * 拟合GARCH模型
 * @param params - GARCH参数
 * @returns 模型结果
 */
export async function fitGARCH(params: GARCHParams): Promise<ModelResult> {
  return apiRequest<ModelResult>('/api/models/garch', params);
}

/**
 * 拟合ARCH模型
 * @param params - ARCH参数
 * @returns 模型结果
 */
export async function fitARCH(params: ARCHParams): Promise<ModelResult> {
  return apiRequest<ModelResult>('/api/models/arch', params);
}

/**
 * 拟合VAR模型
 * @param params - VAR参数
 * @returns 模型结果
 */
export async function fitVAR(params: VARParams): Promise<ModelResult> {
  return apiRequest<ModelResult>('/api/models/var', params);
}

/**
 * 拟合VECM模型
 * @param params - VECM参数
 * @returns 模型结果
 */
export async function fitVECM(params: VECMParams): Promise<ModelResult> {
  return apiRequest<ModelResult>('/api/models/vecm', params);
}

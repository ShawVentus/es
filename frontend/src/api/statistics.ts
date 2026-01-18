/**
 * 统计检验与描述性统计 API 客户端
 */

// 开发模式使用相对路径（通过Vite proxy），生产模式使用环境变量或默认值
// 修复原因：浏览器无法直接访问服务器的9898端口（网络隔离），需通过Vite proxy转发
// 开发模式和生产模式都使用相对路径，通过proxy/nginx转发
const API_BASE_URL = '';

/**
 * 获取当前用户ID
 */
function getCurrentUserId(): string {
  const userStr = localStorage.getItem('librechat_user');

  if (!userStr) {
    throw new Error('未登录：请先访问 LibreChat (http://localhost:3080) 登录后再使用本系统');
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

export interface UnivariateTestResult {
  success: boolean;
  filename: string;
  column: string;
  n_observations: number;
  tests: {
    adf?: any;
    jb?: any;
    ljung_box?: any;
    arch_lm?: any;
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
    pearson_correlation?: any;
    vif?: any;
    johansen?: any;
    granger_causality?: any;
  };
}

// ========== API函数 ==========

/**
 * 运行单变量统计检验
 * @param params - 文件名和列名
 * @returns 统计检验结果
 */
export async function runUnivariateTests(params: {
  filename: string;
  value_col: string;
}): Promise<UnivariateTestResult> {
  return apiRequest<UnivariateTestResult>('/api/statistics/univariate', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 获取描述性统计
 * @param filename - 文件名
 * @param value_col - 数据列名
 * @returns 描述性统计结果
 */
export async function getDescriptiveStats(
  filename: string,
  value_col: string
): Promise<DescriptiveStatsResult> {
  return apiRequest<DescriptiveStatsResult>(
    `/api/preprocessing/stats/${encodeURIComponent(filename)}?value_col=${encodeURIComponent(value_col)}`,
    {
      method: 'GET'
    }
  );
}

/**
 * 运行多变量统计检验
 * @param params - 文件名列表和列名
 * @returns 多变量统计检验结果
 */
export async function runMultivariateTests(params: {
  filenames: string[];
  value_col: string;
  date_col?: string;
}): Promise<MultivariateTestResult> {
  return apiRequest<MultivariateTestResult>('/api/statistics/multivariate', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 金融模块 - 玻尔扣费 API 客户端
 *
 * 封装玻尔积分扣费接口和购买状态管理
 *
 * 创建日期: 2026-01-19
 * 迁移来源: frontend/src/api/billing.ts
 */

import { buildHeaders, type AuthInfo } from './dataset';

// 后端 API 基础地址（直连9898避免Express代理body丢失）
const API_BASE_URL = 'http://localhost:9898';

// 玻尔扣费 API 地址
const BOHRIUM_API_URL = 'https://openapi.dp.tech/openapi/v1/api/integral/consume';

// 固定参数
const SKU_ID = 19001;
const EVENT_VALUE_PER_FILE = 1; // 每个文件1积分

// 调试模式
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

function debugLog(message: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`[Finance/Billing] ${message}`, ...args);
  }
}

/**
 * 玻尔API响应接口定义
 */
interface BohriumApiResponse {
  success?: boolean;
  code?: number | string;
  message?: string;
  msg?: string;
  data?: unknown;
}

/**
 * 从 cookie 中提取玻尔参数
 */
function getBohriumParamsFromCookie(): { accessKey: string; clientName: string } {
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const trimmed = cookie.trim();
    const firstEqualIndex = trimmed.indexOf('=');

    if (firstEqualIndex > 0) {
      const key = trimmed.substring(0, firstEqualIndex);
      const value = trimmed.substring(firstEqualIndex + 1); // 支持value中包含=
      acc[key] = value;
    }

    return acc;
  }, {} as Record<string, string>);

  const accessKey = cookies['appAccessKey'];
  const clientName = cookies['clientName'];

  if (!accessKey || !clientName) {
    debugLog('Missing cookies. Available cookies:', Object.keys(cookies));
    throw new Error('未找到扣费凭证，请确保已登录玻尔平台（https://bohrium.dp.tech）');
  }

  return { accessKey, clientName };
}

/**
 * 生成业务单号（时间戳 + 随机数）
 */
function generateBizNo(): number {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
  return parseInt(`${timestamp}${random}`);
}

/**
 * 调用玻尔扣费 API
 *
 * @param fileCount 文件数量（批量下载时传入数组长度）
 * @returns 扣费结果
 */
export async function chargeForDownload(fileCount: number): Promise<{
  success: boolean;
  message: string;
  bizNo?: number;
}> {
  try {
    // 1. 从 cookie 提取参数
    const { accessKey, clientName } = getBohriumParamsFromCookie();

    // 2. 生成业务单号
    const bizNo = generateBizNo();

    // 3. 构建请求体
    const payload = {
      bizNo,
      changeType: 1,
      eventValue: fileCount * EVENT_VALUE_PER_FILE,
      skuId: SKU_ID,
      scene: 'appCustomizeCharge'
    };

    debugLog('Charging', fileCount, 'files, bizNo:', bizNo);

    // 4. 调用玻尔 API
    const response = await fetch(BOHRIUM_API_URL, {
      method: 'POST',
      headers: {
        'accessKey': accessKey,
        'x-app-key': clientName,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    // 5. 解析响应
    if (!response.ok) {
      debugLog('Bohrium API HTTP error:', response.status, responseText);

      // 根据HTTP状态码给出友好提示
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: '认证失败，请检查登录状态' };
      }
      if (response.status === 429) {
        return { success: false, message: '请求过于频繁，请稍后重试' };
      }

      return {
        success: false,
        message: `扣费失败: HTTP ${response.status}`
      };
    }

    // 尝试解析 JSON
    let result: BohriumApiResponse;
    try {
      result = JSON.parse(responseText);
    } catch {
      // 如果不是 JSON，检查是否包含成功标识
      debugLog('Non-JSON response:', responseText.substring(0, 200));

      if (responseText.includes('success') || responseText.includes('成功')) {
        return {
          success: true,
          message: '扣费成功',
          bizNo
        };
      }
      return {
        success: false,
        message: '扣费响应格式异常，请联系客服'
      };
    }

    // 根据实际返回格式判断成功（兼容多种格式）
    const isSuccess =
      result.success === true ||
      result.code === 0 ||
      result.code === '0' ||
      result.code === 200 ||
      result.code === '200';

    if (isSuccess) {
      debugLog('Charge success:', result);
      return {
        success: true,
        message: `扣费成功，共扣除 ${fileCount * EVENT_VALUE_PER_FILE} 积分`,
        bizNo
      };
    }

    // 扣费失败，提取错误信息
    const errorMessage = result.message || result.msg || '扣费失败，请稍后重试';

    // 针对常见错误给出友好提示
    if (errorMessage.includes('积分不足') || errorMessage.includes('余额不足')) {
      return { success: false, message: '积分不足，请先充值' };
    }
    if (errorMessage.includes('重复') || errorMessage.includes('duplicate')) {
      return { success: false, message: '重复扣费请求，请勿重复点击' };
    }

    debugLog('Charge failed:', result);
    return {
      success: false,
      message: errorMessage
    };

  } catch (error) {
    debugLog('Charge exception:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

/**
 * 标记文件为已购买（后端接口）
 *
 * @param auth 认证信息
 * @param filenames 文件名列表
 */
export async function markAsPurchased(auth: AuthInfo, filenames: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/files/mark-purchased`, {
    method: 'POST',
    headers: buildHeaders(auth),
    body: JSON.stringify({ filenames })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`标记购买失败: ${response.status} - ${error}`);
  }

  debugLog('Marked as purchased:', filenames);
}

/**
 * 检查文件是否已购买（后端接口）
 *
 * @param auth 认证信息
 * @param filename 文件名
 * @returns 是否已购买
 */
export async function checkPurchased(auth: AuthInfo, filename: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/v1/files/check-purchased/${encodeURIComponent(filename)}`, {
    method: 'GET',
    headers: buildHeaders(auth)
  });

  if (!response.ok) {
    debugLog('Check purchased failed:', await response.text());
    return false; // 查询失败视为未购买（安全策略）
  }

  const result = await response.json();
  return result.is_purchased === true;
}

/**
 * 批量检查文件购买状态
 *
 * @param auth 认证信息
 * @param filenames 文件名列表
 * @returns 未购买的文件名列表
 */
export async function getUnpurchasedFiles(auth: AuthInfo, filenames: string[]): Promise<string[]> {
  const unpurchased: string[] = [];

  for (const filename of filenames) {
    const isPurchased = await checkPurchased(auth, filename);
    if (!isPurchased) {
      unpurchased.push(filename);
    }
  }

  debugLog('Unpurchased files:', unpurchased);
  return unpurchased;
}

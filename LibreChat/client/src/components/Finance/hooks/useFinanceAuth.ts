/**
 * 金融模块认证 Hook
 * 
 * 功能：
 * - 封装 LibreChat 的 useAuthContext
 * - 提供与金融 API 兼容的认证信息
 * 
 * 创建日期: 2026-01-18
 */

import { useMemo } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import type { AuthInfo } from '../api/dataset';

/**
 * 获取金融模块认证信息
 * 
 * @returns AuthInfo 对象，可直接传给 API 函数
 */
export function useFinanceAuth(): AuthInfo {
    const { user, token, isAuthenticated } = useAuthContext();

    return useMemo(() => ({
        token,
        user: user ? {
            id: user.id,
            name: user.name,
            email: user.email,
        } : undefined,
        isAuthenticated,
    }), [user, token, isAuthenticated]);
}

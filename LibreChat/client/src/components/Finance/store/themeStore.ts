/**
 * Recoil 状态管理 - 金融模块主题配置
 *
 * 功能:
 * - 全局主题状态管理（6色主题）
 * - 持久化到 localStorage
 * - 跨组件实时同步
 * - 独立于 LibreChat 主题系统
 *
 * 创建日期: 2026-01-15
 * 迁移日期: 2026-01-18
 */

import { atom } from 'recoil';

/**
 * 金融模块支持的主题颜色类型
 */
export type ThemeColor = 'pink' | 'blue' | 'green' | 'purple' | 'light' | 'dark';

// localStorage 键名（加 finance_ 前缀避免冲突）
const STORAGE_KEY = 'finance_theme';

/**
 * 主题状态
 * 默认从 localStorage 读取，未设置则使用 'pink'
 */
export const themeState = atom<ThemeColor>({
    key: 'finance/theme',  // 加 finance/ 前缀避免与 LibreChat 冲突
    default: (localStorage.getItem(STORAGE_KEY) as ThemeColor) || 'pink',
    effects: [
        // 同步到 localStorage
        ({ onSet }) => {
            onSet((newTheme) => {
                localStorage.setItem(STORAGE_KEY, newTheme);
            });
        },
    ],
});

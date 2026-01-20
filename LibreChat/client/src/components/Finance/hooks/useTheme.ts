/**
 * 金融模块主题 Hook
 * 
 * 功能：
 * - 提供 6 色主题状态管理
 * - 返回当前主题和设置函数
 * - 提供主题颜色配置获取
 * 
 * 创建日期: 2026-01-15
 * 迁移日期: 2026-01-18
 */

import { useRecoilState } from 'recoil';
import { themeState, type ThemeColor } from '../store/themeStore';

/**
 * 主题状态 Hook
 * 
 * @returns {Object} theme - 当前主题, setTheme - 设置主题函数
 */
export function useTheme() {
    const [theme, setTheme] = useRecoilState(themeState);
    return { theme, setTheme };
}

/**
 * 主题颜色配置
 * 
 * @description 每个主题包含完整的颜色映射用于 Tailwind CSS 类名
 */
export interface ThemeColors {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    primaryBorder: string;
    primaryText: string;
    gradient: string;
    cardGradient: string;
    buttonText: string;
    highlightText: string;
    highlightBg: string;
    checkIcon: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    selectedBorder: string;
}

/**
 * 获取主题颜色配置
 * 
 * @param theme - 主题名称
 * @returns 主题颜色配置对象
 */
export function getThemeColors(theme: ThemeColor): ThemeColors {
    const configs: Record<ThemeColor, ThemeColors> = {
        pink: {
            primary: 'pink-600',
            primaryHover: 'pink-700',
            primaryLight: 'pink-50',
            primaryBorder: 'pink-200',
            primaryText: 'pink-600',
            gradient: 'from-pink-50 to-rose-50',
            cardGradient: 'from-pink-500 to-rose-600',
            buttonText: 'white',
            highlightText: 'pink-600',
            highlightBg: 'pink-600',
            checkIcon: 'pink-600',
            bgColor: 'bg-white',
            textColor: 'text-gray-900',
            borderColor: 'border-pink-200',
            selectedBorder: 'border-pink-600'
        },
        light: {
            primary: 'gray-900',
            primaryHover: 'gray-800',
            primaryLight: 'gray-50',
            primaryBorder: 'gray-300',
            primaryText: 'gray-900',
            gradient: 'from-white to-gray-50',
            cardGradient: 'from-gray-100 to-gray-200',
            buttonText: 'white',
            highlightText: 'gray-900',
            highlightBg: 'gray-900',
            checkIcon: 'gray-900',
            bgColor: 'bg-white',
            textColor: 'text-gray-900',
            borderColor: 'border-gray-300',
            selectedBorder: 'border-gray-900'
        },
        dark: {
            primary: 'white',
            primaryHover: 'gray-100',
            primaryLight: 'gray-800',
            primaryBorder: 'gray-700',
            primaryText: 'white',
            gradient: 'from-black to-gray-900',
            cardGradient: 'from-gray-800 to-gray-900',
            buttonText: 'black',
            highlightText: 'white',
            highlightBg: 'white',
            checkIcon: 'white',
            bgColor: 'bg-black',
            textColor: 'text-white',
            borderColor: 'border-gray-700',
            selectedBorder: 'border-white'
        },
        blue: {
            primary: 'blue-600',
            primaryHover: 'blue-700',
            primaryLight: 'blue-50',
            primaryBorder: 'blue-200',
            primaryText: 'blue-600',
            gradient: 'from-blue-50 to-cyan-50',
            cardGradient: 'from-blue-500 to-cyan-600',
            buttonText: 'white',
            highlightText: 'blue-600',
            highlightBg: 'blue-600',
            checkIcon: 'blue-600',
            bgColor: 'bg-white',
            textColor: 'text-gray-900',
            borderColor: 'border-blue-200',
            selectedBorder: 'border-blue-600'
        },
        green: {
            primary: 'green-600',
            primaryHover: 'green-700',
            primaryLight: 'green-50',
            primaryBorder: 'green-200',
            primaryText: 'green-600',
            gradient: 'from-green-50 to-emerald-50',
            cardGradient: 'from-green-500 to-emerald-600',
            buttonText: 'white',
            highlightText: 'green-600',
            highlightBg: 'green-600',
            checkIcon: 'green-600',
            bgColor: 'bg-white',
            textColor: 'text-gray-900',
            borderColor: 'border-green-200',
            selectedBorder: 'border-green-600'
        },
        purple: {
            primary: 'purple-600',
            primaryHover: 'purple-700',
            primaryLight: 'purple-50',
            primaryBorder: 'purple-200',
            primaryText: 'purple-600',
            gradient: 'from-purple-50 to-violet-50',
            cardGradient: 'from-purple-500 to-violet-600',
            buttonText: 'white',
            highlightText: 'purple-600',
            highlightBg: 'purple-600',
            checkIcon: 'purple-600',
            bgColor: 'bg-white',
            textColor: 'text-gray-900',
            borderColor: 'border-purple-200',
            selectedBorder: 'border-purple-600'
        }
    };

    return configs[theme];
}

// 重新导出类型
export type { ThemeColor };

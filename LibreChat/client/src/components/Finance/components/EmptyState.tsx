/**
 * 金融模块 - 空状态组件
 * 
 * 功能：
 * - 当用户已登录但没有数据时显示
 * - 提供引导用户前往数据获取页面的入口
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import { Link } from 'react-router-dom';
import { useTheme, getThemeColors } from '../hooks/useTheme';

// 调试模式
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';

interface EmptyStateProps {
    /** 自定义主题（可选，默认使用全局主题） */
    customTheme?: 'light' | 'dark' | string;
    /** 自定义标题 */
    title?: string;
    /** 自定义描述 */
    description?: string;
    /** 跳转链接 */
    linkTo?: string;
    /** 链接文字 */
    linkText?: string;
}

/**
 * 空状态占位组件
 * 
 * @param props - 组件属性
 * @returns 空状态 UI
 */
export function EmptyState({
    customTheme,
    title = '还没有数据',
    description = '开始使用 AI 助手获取金融数据吧！支持美股、A股、港股、加密货币等多种数据源。',
    linkTo = '/c/new',
    linkText = '前往数据获取',
}: EmptyStateProps) {
    const { theme } = useTheme();
    const effectiveTheme = customTheme || theme;
    const isDark = effectiveTheme === 'dark';
    const colors = getThemeColors(effectiveTheme as any);

    if (DEBUG) {
        console.log('[Finance/EmptyState] render', { effectiveTheme, isDark });
    }

    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            {/* 空状态图标 */}
            <div className={`w-24 h-24 rounded-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center mb-6`}>
                <i className={`ri-inbox-line text-5xl ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
            </div>

            {/* 标题 */}
            <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-3`}>
                {title}
            </h3>

            {/* 描述 */}
            <p className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-8 max-w-md`}>
                {description}
            </p>

            {/* 引导按钮 - 使用主题色 */}
            <Link
                to={linkTo}
                className={`px-8 py-4 bg-${colors.primary} text-${colors.buttonText} font-semibold rounded-xl hover:opacity-90 transition-all flex items-center gap-3 shadow-lg hover:shadow-xl`}
                style={{
                    background: `linear-gradient(to right, var(--tw-gradient-from), var(--tw-gradient-to))`,
                    '--tw-gradient-from': '#9333ea',
                    '--tw-gradient-to': '#db2777',
                } as React.CSSProperties}
            >
                <i className="ri-robot-line text-xl" />
                {linkText}
                <i className="ri-arrow-right-line text-xl" />
            </Link>

            {/* 辅助说明 */}
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'} mt-6`}>
                使用 Agent 对话即可自动获取并保存数据
            </p>
        </div>
    );
}

export default EmptyState;

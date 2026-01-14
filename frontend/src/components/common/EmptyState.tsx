/**
 * 空状态组件
 * 
 * 当用户已登录但没有数据时显示
 * 提供引导用户前往数据获取页面的入口
 * 
 * 创建日期: 2026-01-13
 */

import { Link } from 'react-router-dom';

interface EmptyStateProps {
    theme?: 'light' | 'dark' | string;
}

export function EmptyState({ theme = 'light' }: EmptyStateProps) {
    const isDark = theme === 'dark';

    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            {/* 空状态图标 */}
            <div className={`w-24 h-24 rounded-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center mb-6`}>
                <i className={`ri-inbox-line text-5xl ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
            </div>

            {/* 标题 */}
            <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-3`}>
                还没有数据
            </h3>

            {/* 描述 */}
            <p className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-8 max-w-md`}>
                开始使用 AI 助手获取金融数据吧！支持美股、A股、港股、加密货币等多种数据源。
            </p>

            {/* 引导按钮 */}
            <Link
                to="/data-acquisition"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all flex items-center gap-3 shadow-lg hover:shadow-xl"
            >
                <i className="ri-robot-line text-xl"></i>
                前往数据获取
                <i className="ri-arrow-right-line text-xl"></i>
            </Link>

            {/* 辅助说明 */}
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'} mt-6`}>
                使用 Agent 对话即可自动获取并保存数据
            </p>
        </div>
    );
}

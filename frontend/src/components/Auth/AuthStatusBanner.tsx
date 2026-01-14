
import { Link, useLocation } from 'react-router-dom';
import { useLibreChatAuth } from './LibreChatAuth';

/**
 * 认证状态提示条
 * 
 * 功能：
 * - 仅在用户未登录 Agent 且当前不在 Agent 页面时显示
 * - 提供"立即登录"的快捷跳转
 * - 样式适配 Tailwind
 */
export default function AuthStatusBanner() {
    const { isAuthenticated } = useLibreChatAuth();
    const location = useLocation();

    // 1. 如果已登录，不显示
    // 2. 如果当前已经在 /data-acquisition 页面，不显示（避免重复提示）
    if (isAuthenticated || location.pathname === '/data-acquisition') {
        return null;
    }

    return (
        // 使用 sticky 确保提示条始终在顶部可见，但位于 Header 之下
        // z-index 设为 40，确保在普通内容之上，但在 Modal/Dropdown 之下
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 sticky top-[73px] z-40">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-amber-800">
                    <i className="ri-alert-line text-lg"></i>
                    <span>您尚未登录，立即登录即可体验自动化数据获取与时序建模分析。</span>
                </div>
                <Link
                    to="/data-acquisition"
                    className="text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2 flex items-center gap-1"
                >
                    立即登录
                    <i className="ri-arrow-right-line"></i>
                </Link>
            </div>
        </div>
    );
}

/**
 * Finance Header 组件 - 简化版（原型验证）
 * 
 * 功能：
 * - 显示金融平台顶部导航栏
 * - 包含 Logo、导航链接、主题选择器
 * 
 * 调试模式：
 * - 设置 VITE_FINANCE_DEBUG=true 开启调试日志
 */

import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { useTheme } from './hooks/useTheme';
import ThemeSelector from './components/ThemeSelector';

import logo from '~/assets/logo.png';

// 调试日志
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';
const log = (message: string, data?: unknown) => {
    if (DEBUG) {
        console.log(`[FinanceHeader] ${message}`, data ?? '');
    }
};

// Header 固定高度（用于布局计算）
export const FINANCE_HEADER_HEIGHT = 73;

/**
 * 金融平台 Header 组件
 * 
 * @description 顶部导航栏，包含 Logo 和主要功能入口
 */
export default function FinanceHeader() {
    const location = useLocation();
    const { isAuthenticated } = useAuthContext();
    const { theme, setTheme } = useTheme();

    log('render', { pathname: location.pathname, isAuthenticated, theme });

    // 导航链接高亮判断
    const isActive = (path: string) => {
        if (path === '/c/new') {
            return location.pathname.startsWith('/c');
        }
        return location.pathname === path;
    };

    // 导航链接样式（支持暗色模式）
    const navLinkClass = (path: string) => {
        const base = 'text-sm font-medium whitespace-nowrap transition-colors';
        if (isActive(path)) {
            return theme === 'dark'
                ? `${base} text-white font-bold`
                : `${base} text-gray-900 font-bold`;
        }
        return theme === 'dark'
            ? `${base} text-gray-400 hover:text-white`
            : `${base} text-gray-600 hover:text-gray-900`;
    };

    // Header 背景样式
    const headerBgClass = theme === 'dark'
        ? 'bg-gray-900 border-gray-700'
        : 'bg-white border-gray-200';

    // 标题文字样式
    const titleClass = theme === 'dark' ? 'text-white' : 'text-gray-900';

    return (
        <div className="finance-header sticky top-0 z-50 flex flex-col">
            {/* 主导航栏 */}
            <header className={`${headerBgClass} border-b shadow-sm`}>
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo 和导航链接 */}
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-3">
                                <img
                                    src={logo}
                                    alt="Logo"
                                    className="w-10 h-10 object-contain"
                                />
                                <span className={`text-xl font-semibold ${titleClass}`}>
                                    金融时序研究平台
                                </span>
                            </Link>
                            <nav className="flex items-center gap-6">
                                <Link to="/c/new" className={navLinkClass('/c/new')}>
                                    数据获取
                                </Link>
                                <Link to="/my-data" className={navLinkClass('/my-data')}>
                                    我的数据
                                </Link>
                                <Link to="/model-building" className={navLinkClass('/model-building')}>
                                    模型构建
                                </Link>
                                <Link to="/report-analysis" className={navLinkClass('/report-analysis')}>
                                    报告分析
                                </Link>
                            </nav>
                        </div>

                        {/* 右侧工具栏 */}
                        <div className="flex items-center gap-4">
                            {DEBUG && (
                                <span className="text-xs text-gray-400">[DEBUG]</span>
                            )}
                            <ThemeSelector currentTheme={theme} onThemeChange={setTheme} />
                        </div>
                    </div>
                </div>
            </header>
        </div>
    );
}

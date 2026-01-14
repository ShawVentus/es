import { Link, useLocation } from 'react-router-dom';
import { useTheme, getThemeColors } from '../../hooks/useTheme';
import ThemeSelector from '../feature/ThemeSelector';
import { useLibreChatAuth } from '../Auth/LibreChatAuth';

export default function Header() {
    const { theme, setTheme } = useTheme();
    const colors = getThemeColors(theme);
    const location = useLocation();
    const { isAuthenticated } = useLibreChatAuth();

    const showBanner = !isAuthenticated && location.pathname !== '/data-acquisition';

    const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
        const isActive = location.pathname === to;

        let colorClass = 'text-gray-600 hover:text-gray-900';

        if (theme === 'dark') {
            colorClass = isActive ? 'text-white font-bold' : 'text-gray-400 hover:text-white';
        } else if (theme === 'light') {
            colorClass = isActive ? 'text-gray-900 font-bold' : 'text-gray-600 hover:text-gray-900';
        } else {
            // Custom theme
            colorClass = isActive ? `text-${colors.highlightText} font-bold` : `text-gray-600 hover:text-gray-900`;
        }

        return (
            <Link to={to} className={`text-sm font-medium whitespace-nowrap transition-colors ${colorClass}`}>
                {children}
            </Link>
        );
    };

    return (
        <div className="sticky top-0 z-50 flex flex-col">
            {/* Auth Banner - Rendered as part of the sticky header */}
            {showBanner && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
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
            )}

            {/* Main Navbar */}
            <header className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border-b shadow-sm`}>
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-3">
                                <img
                                    src="/logo.png"
                                    alt="Logo"
                                    className="w-10 h-10 object-contain"
                                />
                                <span className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>金融时序研究平台</span>
                            </Link>
                            <nav className="flex items-center gap-6">
                                <NavLink to="/data-acquisition">数据获取</NavLink>
                                <NavLink to="/my-data">我的数据</NavLink>
                                <NavLink to="/model-building">模型构建</NavLink>
                                <NavLink to="/report-analysis">报告分析</NavLink>
                            </nav>
                        </div>
                        <div className="flex items-center gap-4">
                            <button className={`w-9 h-9 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} cursor-pointer`}>
                                <i className={`ri-notification-3-line text-xl ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}></i>
                            </button>
                            <ThemeSelector currentTheme={theme} onThemeChange={setTheme} />
                        </div>
                    </div>
                </div>
            </header>
        </div>
    );
}

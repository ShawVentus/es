
import { Link } from 'react-router-dom';
import ThemeSelector from '../../components/feature/ThemeSelector';
import { useTheme, getThemeColors } from '../../hooks/useTheme';

/**
 * 数据获取页面 (Agent 容器页)
 * 
 * 说明：
 * 此页面现在只是一个"空壳"，仅提供顶部的 Header 导航栏。
 * 实际的 Agent 内容由外层的 <AgentIframe /> 组件通过 fixed 定位覆盖在此页面下方显示。
 * 这样的设计是为了：
 * 1. 保持 Header 在所有页面的一致性
 * 2. 让 iframe 能够脱离路由生命周期实现持久化
 * 3. 这里的 Header 提供了 visual occupancy (视觉占位)，iframe 的 top 偏移量即基于此 Header 的高度
 */

export default function DataAcquisition() {
  const { theme, setTheme } = useTheme();
  const colors = getThemeColors(theme);

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : `bg-gradient-to-br ${colors.gradient}`}`}>
      {/* Header - 保留 V2 原始风格 */}
      <header className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-50`}>
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
                {/* 当前激活页高亮 */}
                <Link to="/data-acquisition" className={`text-sm font-medium whitespace-nowrap ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.highlightText}`}`}>
                  数据获取
                </Link>
                <Link to="/my-data" className={`text-sm font-medium whitespace-nowrap ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                  我的数据
                </Link>
                <Link to="/model-building" className={`text-sm font-medium whitespace-nowrap ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                  模型构建
                </Link>
                <Link to="/report-analysis" className={`text-sm font-medium whitespace-nowrap ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                  报告分析
                </Link>
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

      {/* 
        Main Content 区域留空
        iframe 会通过 position:fixed 渲染在 Header 下方
      */}
      <div className="relative">
      </div>
    </div>
  );
}

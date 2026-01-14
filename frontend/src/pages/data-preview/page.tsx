import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTheme, getThemeColors } from '../../hooks/useTheme';
import ThemeSelector from '../../components/feature/ThemeSelector';
import { getDatasetPreview, downloadDataset, type DatasetPreview } from '../../api/dataset';

export default function DataPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dataId = searchParams.get('id'); // This is the filename
  const { theme, setTheme } = useTheme();
  const colors = getThemeColors(theme);

  const [previewData, setPreviewData] = useState<DatasetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dataId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await getDatasetPreview(dataId);
        setPreviewData(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '加载失败';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dataId]);

  const handleDownload = async () => {
    if (!dataId) return;
    try {
      const blob = await downloadDataset(dataId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dataId.endsWith('.csv') ? dataId : `${dataId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('下载开始');
    } catch {
      toast.error('下载失败');
    }
  };

  // 简单的图表坐标映射
  const chartPath = useMemo(() => {
    if (!previewData?.chart_points || previewData.chart_points.length === 0) return '';

    const points = previewData.chart_points;
    const width = 800;
    const height = 300;
    const padding = 20;

    const yValues = points.map(p => p.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const rangeY = maxY - minY || 1;

    return points.map((p, i) => {
      const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
      const y = height - (padding + ((p.y - minY) / rangeY) * (height - 2 * padding));
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [previewData]);

  if (!dataId) {
    return <div className="p-8 text-center">参数无效</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error || !previewData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="ri-file-warning-line text-6xl text-gray-300 mb-4"></i>
          <p className="text-gray-600 mb-4">{error || '数据不存在'}</p>
          <button onClick={() => navigate('/my-data')} className="text-purple-600 hover:underline">
            返回我的数据
          </button>
        </div>
      </div>
    );
  }

  const { meta, head_rows, columns } = previewData;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${colors.gradient}`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-50`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
                <span className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>金融时序研究平台</span>
              </Link>
              <nav className="flex items-center gap-6">
                <Link to="/my-data" className={`text-sm font-medium whitespace-nowrap ${theme === 'light' || theme === 'dark' ? 'text-gray-900' : `text-${colors.highlightText}`}`}>返回列表</Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <ThemeSelector currentTheme={theme} onThemeChange={setTheme} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/my-data')}
              className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white text-gray-600'} cursor-pointer`}
            >
              <i className="ri-arrow-left-line text-xl"></i>
            </button>
            <div>
              <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-1`}>{meta.name || meta.filename}</h1>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {meta.rows.toLocaleString()} 行 • {meta.cols} 列 • {meta.size_formatted}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-3 py-1.5 rounded ${meta.category === 'Stock' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
              }`}>
              {meta.category || '未分类'}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border-2 p-6 mb-6`}>
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>趋势概览 (Sampling)</h2>
          <div className={`h-80 flex items-center justify-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-gradient-to-br from-gray-50 to-gray-100'} rounded-lg overflow-hidden`}>
            {chartPath ? (
              <svg className="w-full h-full" viewBox="0 0 800 300" preserveAspectRatio="none">
                <path
                  d={chartPath}
                  fill="none"
                  stroke={theme === 'dark' ? '#a78bfa' : '#7c3aed'}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <div className="text-gray-400">暂无图表数据</div>
            )}
          </div>
        </div>

        {/* Descriptive Statistics */}
        <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border-2 p-6 mb-6`}>
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>描述性统计</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {meta.stats && Object.entries(meta.stats).map(([key, value]) => (
              <div key={key} className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} border`}>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>{key}</p>
                <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Data Table */}
        <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border-2 overflow-hidden`}>
          <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>数据预览</h2>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-1`}>显示前 10 行</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                <tr>
                  {columns.map((header, index) => (
                    <th key={index} className={`px-6 py-3 text-left text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'} whitespace-nowrap`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {head_rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={`${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}>
                    {row.map((cell, colIndex) => (
                      <td key={colIndex} className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'} whitespace-nowrap`}>
                        {typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`px-6 py-4 ${theme === 'dark' ? 'bg-gray-800 border-t border-gray-700' : 'bg-gray-50 border-t border-gray-200'} flex items-center justify-between`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {/* Footer info */}
            </p>
            <button
              onClick={handleDownload}
              className={`px-4 py-2 ${theme === 'light' || theme === 'dark' ? 'bg-gray-900 text-white' : `bg-${colors.primary} text-white`} text-sm font-medium rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap cursor-pointer`}
            >
              <i className="ri-download-line text-lg"></i>
              下载完整数据
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

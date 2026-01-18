import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme, getThemeColors } from '../../hooks/useTheme';
import Header from '../../components/common/Header';
import { mockReportContent } from '../../mocks/reportContent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { listReports, getReportDetails, type ReportMeta, getReportDownloadUrl, getCurrentUserId } from '../../api/reports';
import { renderAsync } from 'docx-preview';

interface ModelReport {
  id: string;
  name: string;
  modelType: string;
  dataSource: string;
  createdAt: Date;
  status: 'completed' | 'processing';
  metrics: {
    aic: number;
    bic: number;
    logLikelihood: number;
    rsquared?: number;
    n_observations?: number;
  };
  modelResult?: any; // 完整模型结果
}

export default function ReportAnalysis() {
  const { theme } = useTheme();
  const colors = getThemeColors(theme);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [selectedReport, setSelectedReport] = useState<string>('1');
  const [activeTab, setActiveTab] = useState<'summary' | 'parameters' | 'diagnostics'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(mockReportContent);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [realReports, setRealReports] = useState<ModelReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [showMockWarning, setShowMockWarning] = useState(true);
  const [loadingDocx, setLoadingDocx] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // Fetch real reports on mount
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const result = await listReports();
        if (result.success && result.reports.length > 0) {
          // Convert API response to ModelReport format
          const convertedReports: ModelReport[] = result.reports.map((r: ReportMeta) => ({
            id: r.report_id,
            name: r.report_name,
            modelType: r.model_type,
            dataSource: r.data_source,
            createdAt: new Date(r.created_at * 1000), // Unix timestamp to Date
            status: 'completed' as const,
            metrics: {
              aic: r.metrics.aic || 0,
              bic: r.metrics.bic || 0,
              logLikelihood: 0, // Not in meta
              rsquared: r.metrics.r2
            }
          }));
          setRealReports(convertedReports);
          setShowMockWarning(false); // Hide warning if we have real data

          // 自动选择最新报告（如果有 latestReportId）
          const latestReportId = localStorage.getItem('latestReportId');
          if (latestReportId) {
            const targetReport = convertedReports.find(r => r.id === latestReportId);
            if (targetReport) {
              setSelectedReport(latestReportId);
            }
            // 无论是否找到都清理，避免重复尝试
            localStorage.removeItem('latestReportId');
          }
        }
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setLoadingReports(false);
      }
    };

    fetchReports();
  }, []);

  // Save scroll position when unmounting or changing tabs/reports
  useEffect(() => {
    const container = scrollContainerRef.current;
    console.log('🔍 [保存监听] container:', container);
    if (!container) {
      console.error('❌ scrollContainerRef 为 null！');
      return;
    }

    const handleScroll = () => {
      const scrollPosition = container.scrollTop;
      console.log('💾 [保存] scrollTop:', scrollPosition);
      sessionStorage.setItem('reportScrollPosition', scrollPosition.toString());
    };

    container.addEventListener('scroll', handleScroll);
    console.log('✅ scroll监听器已绑定');
    return () => {
      console.log('🗑️ scroll监听器已移除');
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Restore scroll position when component mounts or tab changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    console.log('🔄 [恢复触发] activeTab:', activeTab, 'selectedReport:', selectedReport);
    console.log('🔄 [恢复触发] container:', container);

    if (!container) {
      console.error('❌ [恢复] container 为 null！');
      return;
    }

    // Only restore on summary tab (where the report content is)
    if (activeTab === 'summary') {
      const savedPosition = sessionStorage.getItem('reportScrollPosition');
      console.log('💾 [恢复] sessionStorage值:', savedPosition);
      console.log('📏 [恢复] scrollHeight:', container.scrollHeight, 'clientHeight:', container.clientHeight);

      if (savedPosition) {
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
          console.log('⏰ [setTimeout] scrollHeight:', container.scrollHeight);
          console.log('⏰ [setTimeout] 尝试设置scrollTop为:', savedPosition);
          container.scrollTop = parseInt(savedPosition, 10);
          console.log('⏰ [setTimeout] 实际scrollTop:', container.scrollTop);
        }, 0);
      }
    }
  }, [activeTab, selectedReport]);

  // Fetch report details when a real report is selected
  useEffect(() => {
    const fetchReportDetails = async () => {
      if (!selectedReport || !realReports.find(r => r.id === selectedReport)) {
        return; // Only fetch for real reports
      }

      try {
        const details = await getReportDetails(selectedReport);
        if (details.success && details.model_result) {
          // Update realReports with detailed metrics
          setRealReports(prev => prev.map(r => {
            if (r.id === selectedReport) {
              return {
                ...r,
                metrics: {
                  ...r.metrics,
                  logLikelihood: details.model_result.metrics?.log_likelihood || 0,
                  n_observations: details.model_result.metrics?.n_observations || 0
                },
                modelResult: details.model_result
              };
            }
            return r;
          }));
        }
      } catch (error) {
        console.error('Failed to fetch report details:', error);
      }
    };

    fetchReportDetails();
  }, [selectedReport, realReports.length]);

  const mockReports: ModelReport[] = [
    {
      id: '1',
      name: '上证指数GARCH(1,1)模型',
      modelType: 'GARCH(1,1)',
      dataSource: '上证指数日度数据',
      createdAt: new Date(2024, 0, 15),
      status: 'completed',
      metrics: {
        aic: -2845.32,
        bic: -2821.45,
        logLikelihood: 1426.66,
        rsquared: 0.89
      }
    },
    {
      id: '2',
      name: '汇率VAR(2)模型',
      modelType: 'VAR(2)',
      dataSource: '美元兑人民币汇率',
      createdAt: new Date(2024, 0, 14),
      status: 'completed',
      metrics: {
        aic: -1234.56,
        bic: -1198.23,
        logLikelihood: 625.28,
        rsquared: 0.76
      }
    },
    {
      id: '3',
      name: '收益率ARMA(2,1)模型',
      modelType: 'ARMA(2,1)',
      dataSource: '沪深300成分股数据',
      createdAt: new Date(2024, 0, 12),
      status: 'completed',
      metrics: {
        aic: -3456.78,
        bic: -3421.34,
        logLikelihood: 1732.39,
        rsquared: 0.92
      }
    },
    {
      id: '4',
      name: '国债收益率VECM模型',
      modelType: 'VECM(2)',
      dataSource: '中国国债收益率曲线',
      createdAt: new Date(2024, 0, 11),
      status: 'completed',
      metrics: {
        aic: -2567.89,
        bic: -2534.12,
        logLikelihood: 1289.94,
        rsquared: 0.85
      }
    },
    {
      id: '5',
      name: 'CPI通胀ARIMA模型',
      modelType: 'ARIMA(1,1,1)',
      dataSource: 'CPI月度数据',
      createdAt: new Date(2024, 0, 10),
      status: 'completed',
      metrics: {
        aic: -1876.45,
        bic: -1852.67,
        logLikelihood: 942.22,
        rsquared: 0.81
      }
    },
    {
      id: '6',
      name: 'Shibor利率ARCH模型',
      modelType: 'ARCH(3)',
      dataSource: 'Shibor利率',
      createdAt: new Date(2024, 0, 9),
      status: 'completed',
      metrics: {
        aic: -3123.56,
        bic: -3098.34,
        logLikelihood: 1565.78,
        rsquared: 0.88
      }
    },
    {
      id: '7',
      name: '欧元汇率VAR模型',
      modelType: 'VAR(3)',
      dataSource: '欧元兑人民币汇率',
      createdAt: new Date(2024, 0, 8),
      status: 'completed',
      metrics: {
        aic: -2234.67,
        bic: -2201.45,
        logLikelihood: 1123.33,
        rsquared: 0.79
      }
    },
    {
      id: '8',
      name: 'PMI指数ARMA模型',
      modelType: 'ARMA(1,2)',
      dataSource: 'PMI制造业指数',
      createdAt: new Date(2024, 0, 7),
      status: 'completed',
      metrics: {
        aic: -1567.89,
        bic: -1543.21,
        logLikelihood: 787.94,
        rsquared: 0.74
      }
    }
  ];

  // Use real reports if available, otherwise fall back to mock data
  const reports = realReports.length > 0 ? realReports : mockReports;

  const filteredReports = reports.filter(report =>
    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.modelType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.dataSource.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentReport = filteredReports.find(r => r.id === selectedReport);

  // Load DOCX preview when a real report is selected
  useEffect(() => {
    let isCancelled = false;

    const loadDocxPreview = async () => {
      if (!currentReport || !realReports.find(r => r.id === currentReport.id)) {
        return; // Only load DOCX for real reports
      }

      // Only load DOCX when on summary tab
      if (activeTab !== 'summary') {
        return;
      }

      if (!docxContainerRef.current) return;

      setLoadingDocx(true);
      try {
        const url = getReportDownloadUrl(currentReport.id);
        const response = await fetch(url, {
          headers: {
            'X-User-Id': getCurrentUserId()
          }
        });

        if (isCancelled) return;

        if (!response.ok) {
          const errorMsg = response.status === 404
            ? '报告文件不存在'
            : `加载失败 (${response.status})`;
          throw new Error(errorMsg);
        }

        const blob = await response.blob();

        if (isCancelled || !docxContainerRef.current) return;

        // 使用try-catch包裹innerHTML清空操作，防止docx-preview残留节点导致错误
        try {
          docxContainerRef.current.innerHTML = '';
        } catch (e) {
          // 如果清空失败，尝试逐个移除子节点
          while (docxContainerRef.current.firstChild) {
            docxContainerRef.current.removeChild(docxContainerRef.current.firstChild);
          }
        }

        await renderAsync(blob, docxContainerRef.current);
      } catch (error) {
        if (isCancelled) return;

        console.error('Failed to load DOCX:', error);
        const errorMessage = error instanceof Error ? error.message : '加载报告失败';
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = `<div class="text-red-500 p-4">${errorMessage}</div>`;
        }
      } finally {
        if (!isCancelled) {
          setLoadingDocx(false);
        }
      }
    };

    loadDocxPreview();

    return () => {
      isCancelled = true;
      // 清理时安全地移除所有docx-preview创建的子节点
      if (docxContainerRef.current) {
        try {
          while (docxContainerRef.current.firstChild) {
            docxContainerRef.current.removeChild(docxContainerRef.current.firstChild);
          }
        } catch (e) {
          // 静默失败，避免报错
        }
      }
    };
  }, [selectedReport, currentReport, realReports, activeTab]);

  const getHighlightStyle = () => {
    if (theme === 'light') {
      return 'bg-gray-900 text-white';
    } else if (theme === 'dark') {
      return 'bg-white text-black';
    } else {
      return `bg-${colors.highlightBg} text-white`;
    }
  };

  const getCheckIconColor = () => {
    if (theme === 'light') {
      return 'text-gray-900';
    } else if (theme === 'dark') {
      return 'text-white';
    } else {
      return `text-${colors.checkIcon}`;
    }
  };

  const handleExportReport = () => {
    const content = isEditing ? editedContent : mockReportContent;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentReport?.name || '模型报告'}_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBatchDelete = () => {
    if (selectedReports.length === 0) return;
    if (confirm(`确定要删除选中的 ${selectedReports.length} 个报告吗？`)) {
      setSelectedReports([]);
      setShowBatchActions(false);
      alert('批量删除功能开发中...');
    }
  };

  const handleBatchExport = () => {
    if (selectedReports.length === 0) return;
    alert(`正在导出 ${selectedReports.length} 个报告...`);
  };

  const toggleReportSelection = (id: string) => {
    setSelectedReports(prev =>
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  const selectAllReports = () => {
    if (selectedReports.length === filteredReports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(filteredReports.map(r => r.id));
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : `bg-gradient-to-br ${colors.gradient}`}`}>
      {/* Header */}
      <Header />

      {/* Mock Data Warning Banner */}
      {showMockWarning && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center">
              <i className="ri-error-warning-line text-yellow-400 text-xl mr-3"></i>
              <p className="text-sm text-yellow-800">
                <span className="font-medium">这是模拟数据</span> - 生成报告即可看到自己的报告
              </p>
            </div>
            <button
              onClick={() => setShowMockWarning(false)}
              className="text-yellow-800 hover:text-yellow-900"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex ${showMockWarning ? 'h-[calc(100vh-73px-56px)]' : 'h-[calc(100vh-73px)]'}`}>
        {/* Left Sidebar - Report List */}
        <div className={`w-80 ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white'} border-r-2 ${colors.borderColor} flex flex-col`}>
          <div className={`p-4 border-b-2 ${colors.borderColor}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>模型报告</h3>
              <button
                onClick={() => setShowBatchActions(!showBatchActions)}
                className={`text-xs font-medium px-2 py-1 rounded ${showBatchActions
                    ? getHighlightStyle()
                    : theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } cursor-pointer whitespace-nowrap`}
              >
                {showBatchActions ? '取消' : '批量管理'}
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <i className={`ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} text-sm`}></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索报告..."
                className={`w-full pl-9 pr-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white'}`}
              />
            </div>
            {showBatchActions && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={selectAllReports}
                  className={`flex-1 text-xs font-medium px-3 py-2 rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} cursor-pointer whitespace-nowrap`}
                >
                  {selectedReports.length === filteredReports.length ? '取消全选' : '全选'}
                </button>
                {selectedReports.length > 0 && (
                  <>
                    <button
                      onClick={handleBatchExport}
                      className={`text-xs font-medium px-3 py-2 rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} cursor-pointer whitespace-nowrap`}
                    >
                      <i className="ri-download-line"></i>
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      className="text-xs font-medium px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={`p-4 rounded-lg cursor-pointer border-2 transition-all ${selectedReport === report.id
                      ? `${colors.selectedBorder} ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`}`
                      : `${colors.borderColor} ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`
                    }`}
                >
                  <div className="flex items-start gap-3">
                    {showBatchActions && (
                      <input
                        type="checkbox"
                        checked={selectedReports.includes(report.id)}
                        onChange={() => toggleReportSelection(report.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={`mt-1 w-4 h-4 text-${colors.primaryText} rounded cursor-pointer flex-shrink-0`}
                      />
                    )}
                    <div className="flex-1 min-w-0" onClick={() => setSelectedReport(report.id)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} line-clamp-2`}>{report.name}</h4>
                        <i className={`ri-file-chart-line ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.primaryText}`} text-lg flex-shrink-0`}></i>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : `bg-${colors.primaryLight} text-${colors.primaryText}`} px-2 py-0.5 rounded whitespace-nowrap`}>
                            {report.modelType}
                          </span>
                          <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} line-clamp-1`}>{report.dataSource}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {report.createdAt.toLocaleDateString('zh-CN')}
                          </span>
                          {report.status === 'completed' && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1 ${theme === 'dark' ? 'bg-gray-700 text-white' : theme === 'light' ? 'bg-white text-black border border-gray-300' : 'bg-green-50 text-green-600'}`}>
                              <i className={`ri-checkbox-circle-fill ${getCheckIconColor()}`}></i>
                              已完成
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`p-4 border-t-2 ${colors.borderColor}`}>
            <Link
              to="/model-building"
              className={`w-full px-4 py-3 ${getHighlightStyle()} text-sm font-medium rounded-lg hover:opacity-90 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all`}
            >
              <i className="ri-add-line text-lg"></i>
              新建模型
            </Link>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 flex flex-col ${theme === 'dark' ? 'bg-black' : 'bg-white'} overflow-hidden`}>
          {currentReport && (
            <>
              {/* Report Header */}
              <div className={`px-6 py-4 border-b-2 ${colors.borderColor}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>{currentReport.name}</h2>
                    <div className={`flex items-center gap-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="flex items-center gap-1.5">
                        <i className={`ri-database-2-line ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        {currentReport.dataSource}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1.5">
                        <i className={`ri-calendar-line ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        {currentReport.createdAt.toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportReport}
                      className={`px-4 py-2 ${theme === 'dark' ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} text-sm font-medium rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer`}
                    >
                      <i className="ri-download-line text-lg"></i>
                      导出报告
                    </button>
                    <button className={`px-4 py-2 ${getHighlightStyle()} text-sm font-medium rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all`}>
                      <i className="ri-share-line text-lg"></i>
                      分享
                    </button>
                  </div>
                </div>

                {/* Tabs - 固定高度避免抖动 */}
                <div className={`flex items-center gap-1 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} rounded-lg p-1 shadow-sm h-12`}>
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`flex-1 h-10 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'summary'
                        ? theme === 'dark' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-900 shadow-md'
                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    模型摘要
                  </button>
                  <button
                    onClick={() => setActiveTab('parameters')}
                    className={`flex-1 h-10 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'parameters'
                        ? theme === 'dark' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-900 shadow-md'
                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    参数估计
                  </button>
                  <button
                    onClick={() => setActiveTab('diagnostics')}
                    className={`flex-1 h-10 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'diagnostics'
                        ? theme === 'dark' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-900 shadow-md'
                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    模型诊断
                  </button>
                </div>
              </div>

              {/* Report Content */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
                <div className="max-w-5xl mx-auto">
                  {activeTab === 'summary' && (
                    <div className="space-y-4">
                      {/* Edit Controls */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>研究报告</h3>
                        {/* Hide edit button for real reports */}
                        {!realReports.find(r => r.id === selectedReport) && (
                          <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer ${isEditing
                                ? getHighlightStyle()
                                : theme === 'dark' ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                          >
                            <i className={`ri-${isEditing ? 'save' : 'edit'}-line text-lg`}></i>
                            {isEditing ? '保存' : '编辑'}
                          </button>
                        )}
                      </div>

                      {/* Model Information */}
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-5 mb-4`}>
                        <h4 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>模型信息</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>模型类型</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelType}</p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>数据来源</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.dataSource}</p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>样本量</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {currentReport.metrics.n_observations || 0} 观测值
                            </p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>估计方法</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>最大似然估计</p>
                          </div>
                        </div>
                      </div>

                      {/* Goodness of Fit Statistics */}
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-5 mb-4`}>
                        <h4 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>拟合优度统计</h4>
                        <div className="grid grid-cols-4 gap-3">
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>AIC</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.metrics.aic.toFixed(2)}</p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>BIC</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.metrics.bic.toFixed(2)}</p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>对数似然</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.metrics.logLikelihood.toFixed(2)}</p>
                          </div>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} border-2 ${colors.borderColor}`}>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>R²</p>
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.metrics.rsquared?.toFixed(4)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Report Content */}
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
                        {isEditing ? (
                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className={`w-full h-[600px] p-4 text-sm font-mono border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 resize-none ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white'}`}
                            placeholder="在此编辑报告内容（Markdown格式）..."
                          />
                        ) : realReports.find(r => r.id === selectedReport) ? (
                          // DOCX Preview for real reports
                          <div key={selectedReport} className={`docx-preview-wrapper ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6`}>
                            {loadingDocx && (
                              <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                              </div>
                            )}
                            <div ref={docxContainerRef} className="docx-preview-container"></div>
                          </div>
                        ) : (
                          // Markdown Preview for mock reports
                          <div ref={reportContentRef} className={`prose prose-sm max-w-none markdown-content ${theme === 'dark' ? 'prose-invert' : ''}`}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                table: ({ node, ...props }: any) => (
                                  <div className="overflow-x-auto my-4">
                                    <table className={`min-w-full border-2 ${colors.borderColor}`} {...props} />
                                  </div>
                                ),
                                thead: ({ node, ...props }) => (
                                  <thead className={`${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} border-b-2 ${colors.borderColor}`} {...props} />
                                ),
                                th: ({ node, ...props }) => (
                                  <th className={`px-4 py-2 text-left text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} border ${colors.borderColor}`} {...props} />
                                ),
                                td: ({ node, ...props }) => (
                                  <td className={`px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} border ${colors.borderColor}`} {...props} />
                                ),
                                h1: ({ node, ...props }) => <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-6 mb-4`} {...props} />,
                                h2: ({ node, ...props }) => <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-5 mb-3`} {...props} />,
                                h3: ({ node, ...props }) => <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-4 mb-2`} {...props} />,
                                p: ({ node, ...props }) => <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-3 leading-relaxed`} {...props} />,
                                ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                                li: ({ node, ...props }) => <li className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} {...props} />,
                                strong: ({ node, ...props }) => <strong className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`} {...props} />,
                                code: ({ node, inline, ...props }: any) =>
                                  inline ? (
                                    <code className={`px-1.5 py-0.5 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} text-sm rounded`} {...props} />
                                  ) : (
                                    <code className={`block p-3 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} text-sm rounded my-2 overflow-x-auto`} {...props} />
                                  ),
                                hr: ({ node, ...props }) => <hr className={`my-6 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`} {...props} />
                              }}
                            >
                              {editedContent}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'parameters' && (
                    <div className="space-y-4">
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} overflow-hidden`}>
                        <div className={`px-6 py-3 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} border-b-2 ${colors.borderColor}`}>
                          <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>参数估计结果</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className={`${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} border-b-2 ${colors.borderColor}`}>
                              <tr>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>参数</th>
                                <th className={`px-6 py-2 text-right text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>估计值</th>
                                {currentReport.modelResult?.parameters?.p_values &&
                                 Object.values(currentReport.modelResult.parameters.p_values).some(p => p !== null) && (
                                  <>
                                    <th className={`px-6 py-2 text-right text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>p值</th>
                                    <th className={`px-6 py-2 text-center text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>显著性</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-800' : 'divide-gray-200'}`}>
                              {currentReport.modelResult?.parameters ? (
                                // 真实数据：从modelResult.parameters提取
                                (() => {
                                  const params = currentReport.modelResult.parameters;
                                  const allParams = params.all_params || params.coefficients || {};
                                  const pValues = params.p_values || {};
                                  const hasPValues = Object.values(pValues).some(p => p !== null);

                                  // 如果没有参数，显示提示
                                  if (Object.keys(allParams).length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={4} className={`px-6 py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                                          暂无参数数据
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return Object.entries(allParams).map(([paramName, value]: [string, any]) => {
                                    const pValue = pValues[paramName];
                                    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
                                    const numPValue = typeof pValue === 'number' ? pValue : null;

                                    // 显著性标记
                                    let significance = '';
                                    if (numPValue !== null) {
                                      if (numPValue < 0.01) significance = '***';
                                      else if (numPValue < 0.05) significance = '**';
                                      else if (numPValue < 0.1) significance = '*';
                                    }

                                    return (
                                      <tr key={paramName} className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                        <td className={`px-6 py-3 text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>{paramName}</td>
                                        <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>{numValue.toFixed(6)}</td>
                                        {hasPValues && (
                                          <>
                                            <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>
                                              {numPValue !== null ? numPValue.toFixed(4) : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                              {significance && (
                                                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">{significance}</span>
                                              )}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    );
                                  });
                                })()
                              ) : (
                                // 降级：显示暂无数据
                                <tr>
                                  <td colSpan={4} className={`px-6 py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                                    暂无参数数据
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className={`px-6 py-3 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} border-t-2 ${colors.borderColor}`}>
                          <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {currentReport.modelResult?.parameters?.p_values &&
                             Object.values(currentReport.modelResult.parameters.p_values).some(p => p !== null)
                              ? '注：*** p<0.01, ** p<0.05, * p<0.1'
                              : currentReport.modelResult?.note || '注：当前模型库不提供参数p值'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'diagnostics' && (
                    <div className="space-y-4">
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-5`}>
                        <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>残差诊断检验</h3>
                        {currentReport.modelResult ? (
                          <div className="space-y-3">
                            {/* 显示检验错误信息（如果有） */}
                            {currentReport.modelResult.residual_tests?.error && (
                              <div className={`p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg`}>
                                <div className="flex items-center gap-2">
                                  <i className="ri-error-warning-line text-yellow-600 text-lg"></i>
                                  <p className="text-sm text-yellow-800">{currentReport.modelResult.residual_tests.error}</p>
                                </div>
                              </div>
                            )}

                            {/* ADF检验 */}
                            {currentReport.modelResult.residual_tests?.adf && !currentReport.modelResult.residual_tests.adf.error && (
                              <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>ADF单位根检验（残差）</h4>
                                  <span className={`text-xs font-medium ${currentReport.modelResult.residual_tests.adf.is_stationary ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2.5 py-1 rounded whitespace-nowrap`}>
                                    {currentReport.modelResult.residual_tests.adf.is_stationary ? '通过' : '未通过'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>ADF统计量</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.adf.test_statistic?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.adf.p_value?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>滞后阶数</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.adf.used_lag || '-'}</p>
                                  </div>
                                </div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                                  结论：{currentReport.modelResult.residual_tests.adf.conclusion || '残差平稳性检验'}
                                </p>
                              </div>
                            )}

                            {/* JB检验 */}
                            {currentReport.modelResult.residual_tests?.jb && !currentReport.modelResult.residual_tests.jb.error && (
                              <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Jarque-Bera正态性检验</h4>
                                  <span className={`text-xs font-medium ${currentReport.modelResult.residual_tests.jb.is_normal ? 'text-green-600 bg-green-50' : 'text-yellow-600 bg-yellow-50'} px-2.5 py-1 rounded whitespace-nowrap`}>
                                    {currentReport.modelResult.residual_tests.jb.is_normal ? '通过' : '警告'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>JB统计量</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.jb.test_statistic?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.jb.p_value?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>样本量</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.jb.n_observations || '-'}</p>
                                  </div>
                                </div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                                  结论：{currentReport.modelResult.residual_tests.jb.conclusion || '正态性检验'}
                                </p>
                              </div>
                            )}

                            {/* Ljung-Box检验 */}
                            {currentReport.modelResult.residual_tests?.ljung_box && !currentReport.modelResult.residual_tests.ljung_box.error && (
                              <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Ljung-Box Q检验（自相关）</h4>
                                  <span className={`text-xs font-medium ${!currentReport.modelResult.residual_tests.ljung_box.has_autocorrelation ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2.5 py-1 rounded whitespace-nowrap`}>
                                    {!currentReport.modelResult.residual_tests.ljung_box.has_autocorrelation ? '通过' : '未通过'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Q统计量</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.ljung_box.test_statistic?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.ljung_box.p_value?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>滞后阶数</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.ljung_box.selected_lag || '-'}</p>
                                  </div>
                                </div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                                  结论：{currentReport.modelResult.residual_tests.ljung_box.conclusion || '自相关检验'}
                                </p>
                              </div>
                            )}

                            {/* ARCH LM检验 */}
                            {currentReport.modelResult.residual_tests?.arch_lm && !currentReport.modelResult.residual_tests.arch_lm.error && (
                              <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>ARCH-LM检验</h4>
                                  <span className={`text-xs font-medium ${!currentReport.modelResult.residual_tests.arch_lm.has_arch_effect ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2.5 py-1 rounded whitespace-nowrap`}>
                                    {!currentReport.modelResult.residual_tests.arch_lm.has_arch_effect ? '通过' : '未通过'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>LM统计量</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.arch_lm.lm_statistic?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.arch_lm.lm_p_value?.toFixed(4) || '-'}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>滞后阶数</p>
                                    <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentReport.modelResult.residual_tests.arch_lm.selected_lag || '-'}</p>
                                  </div>
                                </div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                                  结论：{currentReport.modelResult.residual_tests.arch_lm.conclusion || 'ARCH效应检验'}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`text-center py-8 text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            暂无诊断检验数据
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

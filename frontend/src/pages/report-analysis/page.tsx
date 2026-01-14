import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTheme, getThemeColors } from '../../hooks/useTheme';
import Header from '../../components/common/Header';
import { mockReportContent } from '../../mocks/reportContent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
  };
}

export default function ReportAnalysis() {
  const { theme, setTheme } = useTheme();
  const colors = getThemeColors(theme);
  const reportContentRef = useRef<HTMLDivElement>(null);

  const [selectedReport, setSelectedReport] = useState<string>('1');
  const [activeTab, setActiveTab] = useState<'summary' | 'parameters' | 'diagnostics'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(mockReportContent);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [showBatchActions, setShowBatchActions] = useState(false);

  const reports: ModelReport[] = [
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

  const filteredReports = reports.filter(report =>
    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.modelType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.dataSource.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentReport = filteredReports.find(r => r.id === selectedReport);

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

      {/* Main Content */}
      <div className="flex h-[calc(100vh-73px)]">
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
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-5xl mx-auto">
                  {activeTab === 'summary' && (
                    <div className="space-y-4">
                      {/* Edit Controls */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>研究报告</h3>
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
                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>1,200 观测值</p>
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
                        ) : (
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
                                <th className={`px-6 py-2 text-right text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>标准误</th>
                                <th className={`px-6 py-2 text-right text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>t统计量</th>
                                <th className={`px-6 py-2 text-right text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>p值</th>
                                <th className={`px-6 py-2 text-center text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider whitespace-nowrap`}>显著性</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-800' : 'divide-gray-200'}`}>
                              <tr className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                <td className={`px-6 py-3 text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>μ (均值)</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.0003</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-right whitespace-nowrap`}>0.0001</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>2.456</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.014</td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">**</span>
                                </td>
                              </tr>
                              <tr className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                <td className={`px-6 py-3 text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>ω (常数项)</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.0000</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-right whitespace-nowrap`}>0.0000</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>3.892</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.000</td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">***</span>
                                </td>
                              </tr>
                              <tr className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                <td className={`px-6 py-3 text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>α (ARCH项)</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.0856</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-right whitespace-nowrap`}>0.0123</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>6.959</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.000</td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">***</span>
                                </td>
                              </tr>
                              <tr className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                <td className={`px-6 py-3 text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>β (GARCH项)</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.9012</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-right whitespace-nowrap`}>0.0145</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>62.152</td>
                                <td className={`px-6 py-3 text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-right whitespace-nowrap`}>0.000</td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded whitespace-nowrap">***</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className={`px-6 py-3 ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} border-t-2 ${colors.borderColor}`}>
                          <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            注：*** p&lt;0.01, ** p&lt;0.05, * p&lt;0.1
                          </p>
                        </div>
                      </div>

                      <div className={`${theme === 'dark' ? 'bg-gray-900' : `bg-gradient-to-br ${colors.gradient}`} rounded-xl border-2 ${colors.borderColor} p-5`}>
                        <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>参数解释</h3>
                        <div className={`space-y-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          <p>
                            <strong>ARCH项系数 (α = 0.0856)：</strong>表示前期冲击对当期波动率的影响程度。该值显著为正，说明市场存在波动率聚集效应。
                          </p>
                          <p>
                            <strong>GARCH项系数 (β = 0.9012)：</strong>反映波动率的持续性。该值接近1且高度显著，表明波动率具有很强的持续性。
                          </p>
                          <p>
                            <strong>持续性指标 (α + β = 0.9868)：</strong>接近但小于1，满足平稳性条件，说明波动率冲击会逐渐衰减。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'diagnostics' && (
                    <div className="space-y-4">
                      <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-5`}>
                        <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>残差诊断检验</h3>
                        <div className="space-y-3">
                          <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Ljung-Box Q检验（标准化残差）</h4>
                              <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded whitespace-nowrap">通过</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Q统计量</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>12.456</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>0.342</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>滞后阶数</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>20</p>
                              </div>
                            </div>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                              结论：标准化残差不存在显著的自相关性，模型充分捕捉了序列的线性相关结构。
                            </p>
                          </div>

                          <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>ARCH-LM检验</h4>
                              <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded whitespace-nowrap">通过</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>LM统计量</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>8.234</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>0.567</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>滞后阶数</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>10</p>
                              </div>
                            </div>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                              结论：标准化残差平方不存在显著的ARCH效应，模型有效刻画了条件异方差特征。
                            </p>
                          </div>

                          <div className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : `bg-${colors.primaryLight}`} rounded-lg border-2 ${colors.borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Jarque-Bera正态性检验</h4>
                              <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2.5 py-1 rounded whitespace-nowrap">警告</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>JB统计量</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>156.789</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>p值</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>0.000</p>
                              </div>
                              <div>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>偏度</p>
                                <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>-0.234</p>
                              </div>
                            </div>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-3`}>
                              结论：残差序列拒绝正态性假设，存在尖峰厚尾特征。建议考虑使用t分布或GED分布。
                            </p>
                          </div>
                        </div>
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

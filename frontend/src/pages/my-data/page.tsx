import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { categoryCountsSelector } from '../../store/filesStore';
import { useTheme, getThemeColors } from '../../hooks/useTheme';
import Header from '../../components/common/Header';
import { useDatasets } from '../../hooks/useDatasets';
import { EmptyState } from '../../components/common/EmptyState';
import { DeleteModal } from '../../components/common/DeleteModal';
import type { DatasetMeta } from '../../api/dataset';

type ViewMode = 'grid' | 'list';
type CategoryType = '全部' | '宏观数据' | '利率数据' | '外汇数据' | '期货' | '期权' | '债券' | '现货' | '指数' | 'QDII' | '另类' | '股票数据';
const categories: CategoryType[] = ['全部', '宏观数据', '利率数据', '外汇数据', '期货', '期权', '债券', '现货', '指数', 'QDII', '另类', '股票数据'];

// 分类颜色映射
const getCategoryColor = (category: string) => {
  const colorMap: Record<string, string> = {
    '宏观数据': 'bg-black text-white dark:bg-black dark:text-white',
    '利率数据': 'bg-black text-white dark:bg-black dark:text-white',
    '外汇数据': 'bg-black text-white dark:bg-black dark:text-white',
    '期货': 'bg-black text-white dark:bg-black dark:text-white',
    '期权': 'bg-black text-white dark:bg-black dark:text-white',
    '债券': 'bg-black text-white dark:bg-black dark:text-white',
    '现货': 'bg-black text-white dark:bg-black dark:text-white',
    '指数': 'bg-black text-white dark:bg-black dark:text-white',
    'QDII': 'bg-black text-white dark:bg-black dark:text-white',
    '另类': 'bg-black text-white dark:bg-black dark:text-white',
    '股票数据': 'bg-black text-white dark:bg-black dark:text-white',
  };
  return colorMap[category] || 'bg-black text-white dark:bg-black dark:text-white';
};

export default function MyData() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const colors = getThemeColors(theme);

  // 自定义 hook，封装了数据获取和操作逻辑
  const {
    datasets,
    isLoading,
    refresh,
    deleteDataset,
    downloadDataset,
    batchDownload,
    selectForModeling
  } = useDatasets();

  const categoryCounts = useRecoilValue(categoryCountsSelector);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('全部');
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]); // 存储 filenames
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 删除 Modal 状态
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; filename: string }>({
    isOpen: false,
    filename: ''
  });

  // 计算每个分类的数据数量
  const getCategoryCount = (category: CategoryType) => {
    if (category === '全部') return datasets.length;
    return categoryCounts[category] || 0;
  };

  // 过滤数据
  const filteredData = useMemo(() => {
    return datasets.filter(item => {
      const name = item.name || item.filename;
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [datasets, searchQuery, selectedCategory]);

  // 分页
  const itemsPerPage = viewMode === 'grid' ? 6 : 10;
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  // 重置页码当过滤条件改变
  const handleCategoryChange = (category: CategoryType) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePreview = (filename: string) => {
    // 隐藏后端真实路径，只传递文件名（在预览页通过 ID 获取）
    navigate(`/data-preview?id=${filename}`);
  };

  const handleDownload = async (item: DatasetMeta) => {
    await downloadDataset(item.filename);
  };

  const handleUpload = () => {
    navigate('/data-acquisition');
  };

  // 打开删除确认框
  const openDeleteModal = (filename: string) => {
    setDeleteModalState({ isOpen: true, filename });
    setOpenMenuId(null); // 关闭下拉菜单
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    const success = await deleteDataset(deleteModalState.filename);
    if (success) {
      setDeleteModalState({ isOpen: false, filename: '' });
      // 如果选中的项被删除了，也要从选中列表中移除
      setSelectedItems(prev => prev.filter(id => id !== deleteModalState.filename));
    }
  };

  const handleModelBuilding = (item: DatasetMeta) => {
    selectForModeling(item);
    navigate('/model-building');
  };

  const handleBatchDownload = async () => {
    if (selectedItems.length === 0) return;
    await batchDownload(selectedItems);
    setSelectedItems([]);
    setShowBatchActions(false);
  };

  // 这里的批量删除逻辑比较简单，暂时只做前端提示，后续可接后端批量接口
  const handleBatchDelete = () => {
    // 实际场景建议调用批量删除 API，目前暂不支持
    alert('批量删除接口暂未开放，请逐个删除');
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const selectAllItems = () => {
    if (selectedItems.length === paginatedData.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(paginatedData.map(item => item.filename));
    }
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId(openMenuId === id ? null : id);
  };

  // 动态样式
  const getHighlightStyle = () => {
    if (theme === 'light') {
      return 'bg-gray-900 text-white';
    } else if (theme === 'dark') {
      return 'bg-white text-black';
    } else {
      return `bg-${colors.highlightBg} text-white`;
    }
  };



  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : `bg-gradient-to-br ${colors.gradient}`}`}>
      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>我的数据</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>管理和查看您的所有数据集</p>
          </div>
          <button
            onClick={handleUpload}
            className={`px-6 py-3 ${getHighlightStyle()} text-sm font-semibold rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all`}
          >
            <i className="ri-upload-cloud-line text-xl"></i>
            上传数据
          </button>
        </div>

        {/* Toolbar */}
        <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-4 mb-6`}>
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* Search */}
            <div className="flex-1 max-w-md relative">
              <i className={`ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} text-lg`}></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜索数据集..."
                className={`w-full pl-10 pr-4 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white'}`}
              />
            </div>

            {/* Refresh, Batch Actions & View Mode Toggle */}
            <div className="flex items-center gap-2">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap flex items-center gap-2 transition-all ${
                  isRefreshing || isLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title="刷新数据列表"
              >
                <i className={`ri-refresh-line text-lg ${isRefreshing ? 'animate-spin' : ''}`}></i>
                <span>{isRefreshing ? '刷新中...' : '刷新'}</span>
              </button>
              <button
                onClick={() => setShowBatchActions(!showBatchActions)}
                className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap ${showBatchActions
                  ? getHighlightStyle()
                  : theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {showBatchActions ? '取消' : '批量管理'}
              </button>
              <div className={`flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg p-1`}>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors ${viewMode === 'grid' ? getHighlightStyle() : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-grid-line text-lg"></i>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors ${viewMode === 'list' ? getHighlightStyle() : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-list-check text-lg"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Batch Action Buttons */}
          {showBatchActions && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={selectAllItems}
                className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap ${theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {selectedItems.length === paginatedData.length ? '取消全选' : '全选'}
              </button>
              {selectedItems.length > 0 && (
                <>
                  <button
                    onClick={handleBatchDownload}
                    className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    <i className="ri-download-line"></i>
                    下载 ({selectedItems.length})
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer whitespace-nowrap flex items-center gap-2"
                  >
                    <i className="ri-delete-bin-line"></i>
                    删除 ({selectedItems.length})
                  </button>
                </>
              )}
            </div>
          )}

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => handleCategoryChange(category)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${selectedCategory === category
                  ? getHighlightStyle()
                  : theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {category} ({getCategoryCount(category)})
              </button>
            ))}
          </div>
        </div>

        {/* Data Display */}
        {datasets.length === 0 && !isLoading ? (
          <EmptyState theme={theme} />
        ) : paginatedData.length === 0 ? (
          <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-12 text-center`}>
            <i className={`ri-inbox-line text-6xl ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'} mb-4`}></i>
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>没有找到匹配的数据</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {paginatedData.map((item) => (
              <div
                key={item.filename}
                className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6 relative group hover:border-purple-500 transition-all duration-300 hover:shadow-lg`}
              >
                {/* Selection Checkbox */}
                {showBatchActions && (
                  <div className="absolute top-4 left-4 z-10">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.filename)}
                      onChange={() => toggleItemSelection(item.filename)}
                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                )}

                {/* Menu Button */}
                <div className="absolute top-4 right-4 z-20">
                  <button
                    onClick={() => toggleMenu(item.filename)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-colors cursor-pointer`}
                  >
                    <i className="ri-more-2-fill text-gray-500"></i>
                  </button>

                  {/* Dropdown Menu */}
                  {openMenuId === item.filename && (
                    <div className={`absolute right-0 top-10 w-48 rounded-lg shadow-xl border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200`}>
                      <button
                        onClick={() => {
                          handlePreview(item.filename);
                          setOpenMenuId(null);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                      >
                        <i className="ri-eye-line text-lg"></i>
                        预览数据
                      </button>
                      <button
                        onClick={() => {
                          handleDownload(item);
                          setOpenMenuId(null);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                      >
                        <i className="ri-download-line text-lg"></i>
                        下载文件
                      </button>
                      <button
                        onClick={() => {
                          handleModelBuilding(item);
                          setOpenMenuId(null);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                      >
                        <i className="ri-brain-line text-lg"></i>
                        一键建模
                      </button>
                      <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} my-1`}></div>
                      <button
                        onClick={() => openDeleteModal(item.filename)}
                        className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                      >
                        <i className="ri-delete-bin-line text-lg"></i>
                        删除数据
                      </button>
                    </div>
                  )}
                </div>

                {/* Icon & Title */}
                <div className="flex items-center gap-4 mb-4 mt-2">
                  <div className={`w-12 h-12 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-purple-50'} flex items-center justify-center`}>
                    <i className={`ri-file-chart-line text-2xl ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}></i>
                  </div>
                  <div>
                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-1 line-clamp-1`}>
                      {item.name || item.filename}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${getCategoryColor(item.category)}`}>
                        {item.category || '未分类'}
                      </span>
                      <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        CSV
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className={`grid grid-cols-2 gap-4 mb-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-3`}>
                  <div>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mb-1`}>数据量</p>
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>{item.rows.toLocaleString()} 行</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mb-1`}>特征数</p>
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>{item.cols} 列</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mb-1`}>文件大小</p>
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>{item.size_formatted}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mb-1`}>更新时间</p>
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>
                  {item.filename}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
            {/* List View Implementation */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <tr>
                    <th className="px-6 py-4 text-left">
                      {showBatchActions && (
                        <input type="checkbox" onChange={selectAllItems} checked={selectedItems.length === paginatedData.length && paginatedData.length > 0} />
                      )}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">数据集名称</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">类别</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">行数</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">大小</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">包含列</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">创建时间</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.map((item) => (
                    <tr key={item.filename} className={`${theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-6 py-4">
                        {showBatchActions && (
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.filename)}
                            onChange={() => toggleItemSelection(item.filename)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-purple-50'} flex items-center justify-center`}>
                            <i className={`ri-file-chart-line text-lg ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}></i>
                          </div>
                          <div>
                            <div className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{item.filename}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${getCategoryColor(item.category)}`}>
                          {item.category || '未分类'}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {item.rows.toLocaleString()}
                      </td>
                      <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {item.size_formatted}
                      </td>
                      <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {item.cols} 列
                      </td>
                      <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handlePreview(item.filename)}
                            className={`p-1.5 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                            title="预览"
                          >
                            <i className="ri-eye-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => handleDownload(item)}
                            className={`p-1.5 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                            title="下载"
                          >
                            <i className="ri-download-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => handleModelBuilding(item)}
                            className={`p-1.5 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                            title="一键建模"
                          >
                            <i className="ri-brain-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => openDeleteModal(item.filename)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 dark:hover:bg-red-900/20"
                            title="删除"
                          >
                            <i className="ri-delete-bin-line text-lg"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={`w-9 h-9 flex items-center justify-center rounded-lg border-2 ${colors.borderColor} cursor-pointer ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-gray-900 hover:bg-gray-50'
                }`}
            >
              <i className="ri-arrow-left-s-line text-lg"></i>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium cursor-pointer border-2 ${currentPage === page
                  ? `${colors.selectedBorder} ${getHighlightStyle()}`
                  : `${colors.borderColor} ${theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-gray-900 hover:bg-gray-50'}`
                  }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className={`w-9 h-9 flex items-center justify-center rounded-lg border-2 ${colors.borderColor} cursor-pointer ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-gray-900 hover:bg-gray-50'
                }`}
            >
              <i className="ri-arrow-right-s-line text-lg"></i>
            </button>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <DeleteModal
        isOpen={deleteModalState.isOpen}
        filename={deleteModalState.filename}
        onClose={() => setDeleteModalState({ isOpen: false, filename: '' })}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

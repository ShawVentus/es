/**
 * 金融模块 - 我的数据页面
 * 
 * 功能：
 * - 显示用户的所有数据集
 * - 支持网格/列表视图切换
 * - 支持搜索和分类过滤
 * - 支持批量操作（下载/删除）
 * - 支持单个数据集的预览/下载/建模/删除
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { toast, Toaster } from 'react-hot-toast';

// Finance 模块内部导入
import { categoryCountsSelector } from '../store/filesStore';
import { useTheme, getThemeColors } from '../hooks/useTheme';
import { useDatasets } from '../hooks/useDatasets';
import { useFinanceAuth } from '../hooks/useFinanceAuth';
import { EmptyState } from '../components/EmptyState';
import { DeleteModal } from '../components/DeleteModal';
import { PurchaseModal } from '../components/PurchaseModal';
import * as billing from '../api/billing';
import type { DatasetMeta } from '../api/dataset';

// 调试模式
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';
const log = (message: string, ...args: unknown[]) => {
    if (DEBUG) console.log(`[Finance/MyData] ${message}`, ...args);
};

// ==================== 类型定义 ====================

type ViewMode = 'grid' | 'list';
type CategoryType = '全部' | '宏观数据' | '利率数据' | '外汇数据' | '期货' | '期权' | '债券' | '现货' | '指数' | 'QDII' | '另类' | '股票数据';

const CATEGORIES: CategoryType[] = [
    '全部', '宏观数据', '利率数据', '外汇数据', '期货', '期权',
    '债券', '现货', '指数', 'QDII', '另类', '股票数据'
];

// ==================== 工具函数 ====================

/**
 * 获取分类标签颜色
 */
const getCategoryColor = (category: string): string => {
    // 统一使用黑底白字
    return 'bg-black text-white';
};

// ==================== 主组件 ====================

export default function MyData() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const auth = useFinanceAuth();

    // 数据和操作 Hook
    const {
        datasets,
        isLoading,
        error,
        refresh,
        deleteDataset,
        downloadDataset,
        downloadFile,
        selectForModeling,
    } = useDatasets();

    const categoryCounts = useRecoilValue(categoryCountsSelector);

    // ==================== 状态 ====================

    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<CategoryType>('全部');
    const [currentPage, setCurrentPage] = useState(1);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [showBatchActions, setShowBatchActions] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isBatchDownloading, setIsBatchDownloading] = useState(false);

    // 删除 Modal 状态
    const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; filename: string }>({
        isOpen: false,
        filename: ''
    });

    // 购买 Modal 状态
    const [purchaseModalState, setPurchaseModalState] = useState<{
        isOpen: boolean;
        filename: string;
        isProcessing: boolean;
        onConfirm: () => void;
        onCancel: () => void;
    }>({
        isOpen: false,
        filename: '',
        isProcessing: false,
        onConfirm: () => {},
        onCancel: () => {},
    });

    log('render', { datasetsCount: datasets.length, isLoading, theme });

    // ==================== 计算属性 ====================

    /**
     * 获取分类数据数量
     */
    const getCategoryCount = (category: CategoryType): number => {
        if (category === '全部') return datasets.length;
        return categoryCounts[category] || 0;
    };

    /**
     * 过滤后的数据
     */
    const filteredData = useMemo(() => {
        return datasets.filter(item => {
            const name = item.name || item.filename;
            const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [datasets, searchQuery, selectedCategory]);

    /**
     * 分页数据
     */
    const itemsPerPage = viewMode === 'grid' ? 6 : 10;
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

    // ==================== 事件处理 ====================

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
            toast.success('数据已刷新');
        } catch (err) {
            toast.error('刷新失败');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handlePreview = (filename: string) => {
        log('preview', filename);
        navigate(`/data-preview?id=${encodeURIComponent(filename)}`);
    };

    const handleDownload = async (item: DatasetMeta) => {
        log('download', item.filename);

        // 创建弹窗Promise
        const showPurchaseModal = (filename: string): Promise<boolean> => {
            return new Promise((resolve) => {
                setPurchaseModalState({
                    isOpen: true,
                    filename,
                    isProcessing: false,
                    onConfirm: () => {
                        setPurchaseModalState(prev => ({ ...prev, isProcessing: true }));
                        resolve(true);
                    },
                    onCancel: () => {
                        setPurchaseModalState(prev => ({ ...prev, isOpen: false, isProcessing: false }));
                        resolve(false);
                    },
                });
            });
        };

        try {
            await downloadDataset(item.filename, showPurchaseModal);
            toast.success('下载成功');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '下载失败';
            toast.error(errorMsg);
        } finally {
            setPurchaseModalState(prev => ({ ...prev, isOpen: false, isProcessing: false }));
        }
    };

    const handleUpload = () => {
        navigate('/c/new'); // 跳转到聊天页面获取数据
    };

    const openDeleteModal = (filename: string) => {
        setDeleteModalState({ isOpen: true, filename });
        setOpenMenuId(null);
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            const success = await deleteDataset(deleteModalState.filename);
            if (success) {
                setDeleteModalState({ isOpen: false, filename: '' });
                setSelectedItems(prev => prev.filter(id => id !== deleteModalState.filename));
                toast.success('删除成功');
            } else {
                toast.error('删除失败');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleModelBuilding = (item: DatasetMeta) => {
        log('model building', item.filename);
        selectForModeling(item);
    };

    const handleBatchDownload = async () => {
        if (selectedItems.length === 0) return;

        // 防抖保护
        if (isBatchDownloading) {
            toast.error('批量下载正在进行中，请勿重复点击');
            return;
        }

        setIsBatchDownloading(true);

        try {
            // 1. 预检查购买状态（批量查询）
            log('Batch download: checking purchase status for', selectedItems.length, 'files');
            toast.loading('正在检查购买状态...', { id: 'batch-download' });

            const unpurchasedFiles: string[] = [];
            const purchasedFiles: string[] = [];

            for (const filename of selectedItems) {
                const isPurchased = await billing.checkPurchased(auth, filename);
                if (isPurchased) {
                    purchasedFiles.push(filename);
                } else {
                    unpurchasedFiles.push(filename);
                }
            }

            log('Batch download: purchased:', purchasedFiles.length, 'unpurchased:', unpurchasedFiles.length);

            // 2. 如果有未购买的文件，显示确认弹窗
            if (unpurchasedFiles.length > 0) {
                const confirmed = await new Promise<boolean>((resolve) => {
                    setPurchaseModalState({
                        isOpen: true,
                        filename: `${unpurchasedFiles.length} 个文件`,
                        isProcessing: false,
                        onConfirm: () => {
                            setPurchaseModalState(prev => ({ ...prev, isProcessing: true }));
                            resolve(true);
                        },
                        onCancel: () => {
                            setPurchaseModalState(prev => ({ ...prev, isOpen: false, isProcessing: false }));
                            resolve(false);
                        },
                    });
                });

                if (!confirmed) {
                    toast.dismiss('batch-download');
                    setPurchaseModalState(prev => ({ ...prev, isOpen: false, isProcessing: false }));
                    return;
                }
            }

            // 3. 逐个扣费和下载（未购买的文件）
            const results = { success: 0, failed: [] as string[] };

            for (const filename of unpurchasedFiles) {
                try {
                    toast.loading(`正在扣费: ${filename}`, { id: 'batch-download' });

                    // 扣费
                    const chargeResult = await billing.chargeForDownload(1);
                    if (!chargeResult.success) {
                        throw new Error(chargeResult.message);
                    }

                    // 标记已购买
                    await billing.markAsPurchased(auth, [filename]);

                    // 下载（使用纯下载函数，不重复扣费）
                    toast.loading(`正在下载: ${filename}`, { id: 'batch-download' });
                    await downloadFile(filename);

                    results.success++;
                } catch (err) {
                    log('Batch download error:', filename, err);
                    results.failed.push(filename);
                }
            }

            // 4. 下载已购买的文件（使用纯下载函数）
            for (const filename of purchasedFiles) {
                try {
                    toast.loading(`正在下载: ${filename}`, { id: 'batch-download' });
                    await downloadFile(filename);
                    results.success++;
                } catch (err) {
                    log('Batch download error:', filename, err);
                    results.failed.push(filename);
                }
            }

            // 5. 显示结果
            toast.dismiss('batch-download');
            if (results.failed.length > 0) {
                toast.error(`成功: ${results.success}个，失败: ${results.failed.length}个`);
            } else {
                toast.success(`已成功下载 ${results.success} 个文件`);
            }

            setSelectedItems([]);
            setShowBatchActions(false);

        } catch (err) {
            log('Batch download exception:', err);
            toast.dismiss('batch-download');
            toast.error('批量下载失败');
        } finally {
            setIsBatchDownloading(false);
            setPurchaseModalState(prev => ({ ...prev, isOpen: false, isProcessing: false }));
        }
    };

    const handleBatchDelete = () => {
        toast.error('批量删除接口暂未开放，请逐个删除');
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

    /**
     * 获取高亮样式
     */
    const getHighlightStyle = (): string => {
        if (theme === 'light') {
            return 'bg-gray-900 text-white';
        } else if (theme === 'dark') {
            return 'bg-white text-black';
        } else {
            return `bg-${colors.highlightBg} text-white`;
        }
    };

    // ==================== 渲染 ====================

    return (
        <div className={`h-full overflow-y-auto ${theme === 'dark' ? 'bg-black' : `bg-gradient-to-br ${colors.gradient}`}`}>
            <Toaster position="top-center" toastOptions={{ style: { marginTop: '80px' } }} />
            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Page Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
                            我的数据
                        </h1>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            管理和查看您的所有数据集
                        </p>
                    </div>
                    <button
                        onClick={handleUpload}
                        className={`px-6 py-3 ${getHighlightStyle()} text-sm font-semibold rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all`}
                    >
                        <i className="ri-upload-cloud-line text-xl" />
                        上传数据
                    </button>
                </div>

                {/* Toolbar */}
                <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-4 mb-6`}>
                    <div className="flex items-center justify-between gap-4 mb-4">
                        {/* Search */}
                        <div className="flex-1 max-w-md relative">
                            <i className={`ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} text-lg`} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="搜索数据集..."
                                className={`w-full pl-10 pr-4 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white'}`}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing || isLoading}
                                className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap flex items-center gap-2 transition-all ${isRefreshing || isLoading
                                    ? 'opacity-50 cursor-not-allowed'
                                    : theme === 'dark'
                                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                title="刷新数据列表"
                            >
                                <i className={`ri-refresh-line text-lg ${isRefreshing ? 'animate-spin' : ''}`} />
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
                                    <i className="ri-grid-line text-lg" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors ${viewMode === 'list' ? getHighlightStyle() : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <i className="ri-list-check text-lg" />
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
                                        <i className="ri-download-line" />
                                        下载 ({selectedItems.length})
                                    </button>
                                    <button
                                        onClick={handleBatchDelete}
                                        className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                        <i className="ri-delete-bin-line" />
                                        删除 ({selectedItems.length})
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Category Filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {CATEGORIES.map((category) => (
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
                    <EmptyState customTheme={theme} />
                ) : paginatedData.length === 0 ? (
                    <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-12 text-center`}>
                        <i className={`ri-inbox-line text-6xl ${theme === 'dark' ? 'text-gray-700' : 'text-gray-300'} mb-4`} />
                        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>没有找到匹配的数据</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Grid View */
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
                                        <i className="ri-more-2-fill text-gray-500" />
                                    </button>

                                    {/* Dropdown Menu */}
                                    {openMenuId === item.filename && (
                                        <div className={`absolute right-0 top-10 w-48 rounded-lg shadow-xl border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} overflow-hidden z-30`}>
                                            <button
                                                onClick={() => { handlePreview(item.filename); setOpenMenuId(null); }}
                                                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                                            >
                                                <i className="ri-eye-line text-lg" />
                                                预览数据
                                            </button>
                                            <button
                                                onClick={() => { handleDownload(item); setOpenMenuId(null); }}
                                                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                                            >
                                                <i className="ri-download-line text-lg" />
                                                下载文件
                                            </button>
                                            <button
                                                onClick={() => { handleModelBuilding(item); setOpenMenuId(null); }}
                                                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'} cursor-pointer`}
                                            >
                                                <i className="ri-brain-line text-lg" />
                                                一键建模
                                            </button>
                                            <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} my-1`} />
                                            <button
                                                onClick={() => openDeleteModal(item.filename)}
                                                className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                                            >
                                                <i className="ri-delete-bin-line text-lg" />
                                                删除数据
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Icon & Title */}
                                <div className="flex items-center gap-4 mb-4 mt-2">
                                    <div className={`w-12 h-12 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-purple-50'} flex items-center justify-center`}>
                                        <i className={`ri-file-chart-line text-2xl ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
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
                    /* List View */
                    <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                    <tr>
                                        <th className="px-6 py-4 text-left">
                                            {showBatchActions && (
                                                <input
                                                    type="checkbox"
                                                    onChange={selectAllItems}
                                                    checked={selectedItems.length === paginatedData.length && paginatedData.length > 0}
                                                />
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
                                                        <i className={`ri-file-chart-line text-lg ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
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
                                                        <i className="ri-eye-line text-lg" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload(item)}
                                                        className={`p-1.5 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        title="下载"
                                                    >
                                                        <i className="ri-download-line text-lg" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleModelBuilding(item)}
                                                        className={`p-1.5 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        title="一键建模"
                                                    >
                                                        <i className="ri-brain-line text-lg" />
                                                    </button>
                                                    <button
                                                        onClick={() => openDeleteModal(item.filename)}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 dark:hover:bg-red-900/20"
                                                        title="删除"
                                                    >
                                                        <i className="ri-delete-bin-line text-lg" />
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
                            <i className="ri-arrow-left-s-line text-lg" />
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
                            <i className="ri-arrow-right-s-line text-lg" />
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
                isDeleting={isDeleting}
            />

            {/* 购买确认弹窗 */}
            <PurchaseModal
                isOpen={purchaseModalState.isOpen}
                filename={purchaseModalState.filename}
                fileCount={purchaseModalState.filename.includes('个文件') ? parseInt(purchaseModalState.filename) : 1}
                onConfirm={purchaseModalState.onConfirm}
                onCancel={purchaseModalState.onCancel}
                isProcessing={purchaseModalState.isProcessing}
            />
        </div>
    );
}

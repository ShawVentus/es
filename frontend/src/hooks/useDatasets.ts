/**
 * 数据集管理 Hook
 * 
 * 封装数据集列表的获取、刷新、删除等操作
 * 使用 Recoil 进行状态管理，实现跨页面共享和 5 分钟被动缓存
 * 
 * 创建日期: 2026-01-13
 */

import { useEffect, useCallback, useState } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { toast } from 'react-hot-toast';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import {
    datasetFilesState,
    lastFetchTimeState,
    isLoadingState,
    loadErrorState,
    shouldRefreshSelector,
    selectedDataForModelState,
} from '../store/filesStore';
import { useLibreChatAuth } from '../components/Auth/LibreChatAuth';
import * as api from '../api/dataset';
import * as billing from '../api/billing';
import type { DatasetMeta } from '../api/dataset';

/**
 * 模拟数据常量
 * 当 API 返回空数据或调用失败时使用
 */
const MOCK_DATASET: DatasetMeta = {
    id: 'mock-nvda-dataset',
    filename: 'NVDA_Half_Year_Prices_202507_202601.csv',
    name: 'NVDA半年价格数据（模拟）',
    category: '股票数据',
    rows: 128,
    cols: 10,
    size: 17584,
    size_formatted: '17.2 KB',
    created_at: '2026-01-15T21:32:09.235695',
    columns: ['ticker', 'price', 'currency', 'timestamp', 'volume', 'open_price', 'high_price', 'low_price', 'close_price', 'source'],
    stats: {
        Min: 100.5,
        Max: 550.2,
        Mean: 325.3,
        Median: 320.1,
        'Std.Dev': 85.4,
        Skewness: 0.15,
        Kurtosis: -0.5
    }
};

/**
 * 数据集管理 Hook 返回类型
 */
interface UseDatasets {
    // 状态
    datasets: DatasetMeta[];
    isLoading: boolean;
    error: string | null;
    isAuthenticated: boolean;

    // 操作
    refresh: () => Promise<void>;
    deleteDataset: (filename: string) => Promise<boolean>;
    downloadDataset: (filename: string) => Promise<void>;
    batchDownload: (filenames: string[]) => Promise<{ success: number; failed: string[] }>;
    selectForModeling: (dataset: DatasetMeta) => void;
}

/**
 * 数据集管理 Hook
 */
export function useDatasets(): UseDatasets {
    const { isAuthenticated, user } = useLibreChatAuth();

    const [datasets, setDatasets] = useRecoilState(datasetFilesState);
    const [isLoading, setIsLoading] = useRecoilState(isLoadingState);
    const [error, setError] = useRecoilState(loadErrorState);
    const setLastFetchTime = useSetRecoilState(lastFetchTimeState);
    const shouldRefresh = useRecoilValue(shouldRefreshSelector);
    const setSelectedDataForModel = useSetRecoilState(selectedDataForModelState);

    // 并发控制：记录正在下载的文件
    const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

    /**
     * 获取数据集列表
     */
    const fetchDatasets = useCallback(async () => {
        // 直接从 localStorage 获取用户信息（不依赖 isAuthenticated 状态）
        const userStr = localStorage.getItem('librechat_user');
        const authStr = localStorage.getItem('librechat_auth');

        console.log('[useDatasets] Auth check:', {
            isAuthenticated,
            hasUserFromHook: !!user?.id,
            localStorageAuth: authStr,
            hasLocalStorageUser: !!userStr
        });

        // 如果 localStorage 中没有用户信息，跳过
        if (!userStr || authStr !== 'true') {
            console.log('[useDatasets] Not authenticated or no user in localStorage, skipping fetch');
            return;
        }

        // 尝试解析用户信息
        let userId: string | undefined;
        try {
            const userData = JSON.parse(userStr);
            userId = userData.id || userData.email;
            console.log('[useDatasets] User ID from localStorage:', userId);
        } catch (e) {
            console.error('[useDatasets] Failed to parse user from localStorage:', e);
            return;
        }

        if (!userId) {
            console.log('[useDatasets] No user ID or email found, skipping fetch');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            console.log('[useDatasets] Fetching datasets...');
            const data = await api.listDatasets();

            // 如果返回的数据为空，也使用模拟数据
            if (!data || data.length === 0) {
                console.warn('[useDatasets] API 返回空数据，加载模拟数据...');
                setDatasets([MOCK_DATASET]);
                toast('当前无数据，已加载模拟数据供测试使用', { icon: 'ℹ️' });
            } else {
                setDatasets(data);
                console.log('[useDatasets] Fetched', data.length, 'datasets');
            }

            setLastFetchTime(Date.now());
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '获取数据失败';
            setError(errorMsg);

            // 失败时加载模拟数据
            console.warn('[useDatasets] 数据获取失败，加载模拟数据...');
            setDatasets([MOCK_DATASET]);
            setLastFetchTime(Date.now());

            toast.error(`${errorMsg}，已加载模拟数据供测试使用`);
            console.error('[useDatasets] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, user?.id, setDatasets, setLastFetchTime, setIsLoading, setError]);

    /**
     * 被动刷新逻辑：页面加载时检查是否需要刷新
     */
    useEffect(() => {
        if (isAuthenticated && shouldRefresh) {
            fetchDatasets();
        }
    }, [isAuthenticated, shouldRefresh, fetchDatasets]);

    /**
     * 手动刷新
     */
    const refresh = useCallback(async () => {
        await fetchDatasets();
        toast.success('刷新成功');
    }, [fetchDatasets]);

    /**
     * 删除数据集
     */
    const deleteDataset = useCallback(async (filename: string): Promise<boolean> => {
        try {
            await api.deleteDataset(filename);
            // 从本地状态移除
            setDatasets(prev => prev.filter(d => d.filename !== filename && d.name !== filename));
            toast.success('删除成功');
            return true;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '删除失败';
            toast.error(errorMsg);
            return false;
        }
    }, [setDatasets]);

    /**
     * 下载单个数据集（带扣费检查 + 错误回滚 + 并发控制）
     */
    const downloadDataset = useCallback(async (filename: string) => {
        // 并发控制：检查是否正在下载
        if (downloadingFiles.has(filename)) {
            toast.error('该文件正在下载中，请勿重复点击');
            return;
        }

        // 标记为下载中
        setDownloadingFiles(prev => new Set(prev).add(filename));

        let hasCharged = false;
        let hasMarked = false;

        try {
            // 1. 检查是否已购买
            const isPurchased = await billing.checkPurchased(filename);

            if (isPurchased) {
                // 已购买，直接下载
                const blob = await api.downloadDataset(filename);
                saveAs(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
                toast.success('下载成功');
                return;
            }

            // 2. 未购买，先扣费
            toast.loading('正在扣费...');
            const chargeResult = await billing.chargeForDownload(1);

            if (!chargeResult.success) {
                toast.dismiss();
                toast.error(`扣费失败: ${chargeResult.message}`);
                return;
            }

            hasCharged = true;

            // 3. 扣费成功，标记已购买
            toast.dismiss();
            toast.loading('正在标记购买...');
            await billing.markAsPurchased([filename]);
            hasMarked = true;

            // 4. 下载文件
            toast.dismiss();
            toast.loading('正在下载...');
            const blob = await api.downloadDataset(filename);
            saveAs(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);

            toast.dismiss();
            toast.success('下载成功（已扣除1积分）');

        } catch (err) {
            toast.dismiss();

            // 错误回滚：如果已标记购买但下载失败，撤销购买标记
            if (hasMarked) {
                console.error('[Download] Download failed after marking purchased, rolling back...');
                await billing.unmarkPurchased([filename]);

                if (hasCharged) {
                    toast.error('下载失败，已撤销购买标记。积分已扣除，请联系客服处理或稍后重试。');
                } else {
                    toast.error('下载失败，已撤销购买标记');
                }
            } else {
                const errorMsg = err instanceof Error ? err.message : '下载失败';
                toast.error(errorMsg);
            }
        } finally {
            // 移除下载中标记
            setDownloadingFiles(prev => {
                const next = new Set(prev);
                next.delete(filename);
                return next;
            });
        }
    }, [downloadingFiles]);

    /**
     * 批量下载（带容错 + 批量扣费）
     */
    const batchDownload = useCallback(async (filenames: string[]): Promise<{ success: number; failed: string[] }> => {
        // 边界检查：空列表
        if (filenames.length === 0) {
            toast.error('请先选择要下载的文件');
            return { success: 0, failed: [] };
        }

        const failed: string[] = [];

        try {
            // 1. 筛选出未购买的文件
            const toastId1 = toast.loading('正在检查购买状态...');
            const unpurchasedFiles = await billing.getUnpurchasedFiles(filenames);
            toast.dismiss(toastId1);

            // 2. 如果有未购买的文件，先批量扣费
            if (unpurchasedFiles.length > 0) {
                const totalCost = unpurchasedFiles.length;
                const toastId2 = toast.loading(`需要扣除 ${totalCost} 积分，正在扣费...`);

                const chargeResult = await billing.chargeForDownload(unpurchasedFiles.length);

                toast.dismiss(toastId2);

                if (!chargeResult.success) {
                    toast.error(`扣费失败: ${chargeResult.message}`);
                    return { success: 0, failed: filenames };
                }

                // 3. 扣费成功，批量标记已购买
                const toastId3 = toast.loading('正在标记购买...');
                await billing.markAsPurchased(unpurchasedFiles);
                toast.dismiss(toastId3);

                toast.success(`扣费成功，已扣除 ${totalCost} 积分`);
            } else {
                toast.success('所有文件均已购买，开始下载');
            }

            // 4. 批量下载（所有文件都已购买）
            const zip = new JSZip();
            let successCount = 0;

            const toastId4 = toast.loading(`正在打包 ${filenames.length} 个文件...`);

            for (const filename of filenames) {
                try {
                    const blob = await api.downloadDataset(filename);
                    let zipFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

                    // 防重名逻辑
                    if (zip.file(zipFilename)) {
                        const baseName = zipFilename.replace(/\.csv$/, '');
                        zipFilename = `${baseName}_1.csv`;
                    }

                    zip.file(zipFilename, blob);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to download ${filename}:`, err);
                    failed.push(filename);
                }
            }

            // 5. 生成 ZIP
            if (successCount > 0) {
                const content = await zip.generateAsync({ type: 'blob' });
                const timestamp = new Date().toISOString().slice(0, 10);
                saveAs(content, `datasets_${timestamp}.zip`);
            }

            // 6. 显示结果
            toast.dismiss(toastId4);
            if (failed.length > 0) {
                toast.error(`成功: ${successCount}, 失败: ${failed.length}`);
            } else {
                toast.success(`已下载 ${successCount} 个文件`);
            }

            return { success: successCount, failed };

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '批量下载失败';
            toast.error(errorMsg);
            return { success: 0, failed: filenames };
        }
    }, []);

    /**
     * 选中用于建模
     */
    const selectForModeling = useCallback((dataset: DatasetMeta) => {
        setSelectedDataForModel(dataset);
        // 同时存入 localStorage 作为备份
        localStorage.setItem('selectedDataForModel', JSON.stringify(dataset));
    }, [setSelectedDataForModel]);

    return {
        datasets,
        isLoading,
        error,
        isAuthenticated,
        refresh,
        deleteDataset,
        downloadDataset,
        batchDownload,
        selectForModeling,
    };
}

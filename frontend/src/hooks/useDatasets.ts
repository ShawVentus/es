/**
 * 数据集管理 Hook
 * 
 * 封装数据集列表的获取、刷新、删除等操作
 * 使用 Recoil 进行状态管理，实现跨页面共享和 5 分钟被动缓存
 * 
 * 创建日期: 2026-01-13
 */

import { useEffect, useCallback } from 'react';
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
import type { DatasetMeta } from '../api/dataset';

/**
 * 模拟数据常量
 * 当 API 返回空数据或调用失败时使用
 */
const MOCK_DATASET: DatasetMeta = {
    filename: 'NVDA_Half_Year_Prices_202507_202601.csv',
    name: 'NVDA半年价格数据（模拟）',
    category: '股票数据',
    rows: 128,
    cols: 10,
    size: 17584,
    size_formatted: '17.2 KB',
    created_at: '2026-01-15T21:32:09.235695',
    columns: ['ticker', 'price', 'currency', 'timestamp', 'volume', 'open_price', 'high_price', 'low_price', 'close_price', 'source']
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
                toast.info('当前无数据，已加载模拟数据供测试使用');
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
     * 下载单个数据集
     */
    const downloadDataset = useCallback(async (filename: string) => {
        try {
            const blob = await api.downloadDataset(filename);
            saveAs(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
            toast.success('下载成功');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '下载失败';
            toast.error(errorMsg);
        }
    }, []);

    /**
     * 批量下载（带容错）
     */
    const batchDownload = useCallback(async (filenames: string[]): Promise<{ success: number; failed: string[] }> => {
        const zip = new JSZip();
        const failed: string[] = [];
        let success = 0;

        // 显示进度提示
        const toastId = toast.loading(`正在打包 ${filenames.length} 个文件...`);

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
                success++;
            } catch {
                failed.push(filename);
            }
        }

        // 生成 ZIP
        if (success > 0) {
            const content = await zip.generateAsync({ type: 'blob' });
            const timestamp = new Date().toISOString().slice(0, 10);
            saveAs(content, `datasets_${timestamp}.zip`);
        }

        // 显示结果
        toast.dismiss(toastId);
        if (failed.length > 0) {
            toast.error(`成功: ${success}, 失败: ${failed.length}\n${failed.join(', ')}`);
        } else {
            toast.success(`已下载 ${success} 个文件`);
        }

        return { success, failed };
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

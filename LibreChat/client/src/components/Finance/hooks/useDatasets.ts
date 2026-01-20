/**
 * 金融模块 - 数据集管理 Hook
 * 
 * 封装数据集列表的获取、刷新、删除等操作
 * 使用 Recoil 进行状态管理，实现跨页面共享
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import { useEffect, useCallback, useState } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';

import {
    datasetFilesState,
    lastFetchTimeState,
    isLoadingState,
    loadErrorState,
    shouldRefreshSelector,
    selectedDataForModelState,
} from '../store/filesStore';
import { useFinanceAuth } from './useFinanceAuth';
import * as api from '../api/dataset';
import * as billing from '../api/billing';
import type { DatasetMeta } from '../api/dataset';

// 调试日志
const DEBUG = import.meta.env.VITE_FINANCE_DEBUG === 'true';
const log = (message: string, ...args: unknown[]) => {
    if (DEBUG) {
        console.log(`[Finance/useDatasets] ${message}`, ...args);
    }
};

/**
 * 模拟数据（API 返回空时使用）
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
    datasets: DatasetMeta[];
    isLoading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    refresh: () => Promise<void>;
    deleteDataset: (filename: string) => Promise<boolean>;
    downloadDataset: (filename: string) => Promise<void>;
    selectForModeling: (dataset: DatasetMeta) => void;
}

/**
 * 数据集管理 Hook
 */
export function useDatasets(): UseDatasets {
    const auth = useFinanceAuth();
    const navigate = useNavigate();

    const [datasets, setDatasets] = useRecoilState(datasetFilesState);
    const [isLoading, setIsLoading] = useRecoilState(isLoadingState);
    const [error, setError] = useRecoilState(loadErrorState);
    const setLastFetchTime = useSetRecoilState(lastFetchTimeState);
    const shouldRefresh = useRecoilValue(shouldRefreshSelector);
    const setSelectedDataForModel = useSetRecoilState(selectedDataForModelState);

    const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

    /**
     * 获取数据集列表
     */
    const fetchDatasets = useCallback(async () => {
        if (!auth.isAuthenticated) {
            log('Not authenticated, skipping fetch');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            log('Fetching datasets...');
            const data = await api.listDatasets(auth);

            if (!data || data.length === 0) {
                log('API returned empty data, using mock');
                setDatasets([MOCK_DATASET]);
            } else {
                setDatasets(data);
                log('Fetched', data.length, 'datasets');
            }

            setLastFetchTime(Date.now());
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '获取数据失败';
            setError(errorMsg);
            log('Fetch error:', err);

            // 失败时使用模拟数据
            setDatasets([MOCK_DATASET]);
            setLastFetchTime(Date.now());
        } finally {
            setIsLoading(false);
        }
    }, [auth, setDatasets, setLastFetchTime, setIsLoading, setError]);

    /**
     * 被动刷新：页面加载时检查是否需要刷新
     */
    useEffect(() => {
        if (auth.isAuthenticated && shouldRefresh) {
            fetchDatasets();
        }
    }, [auth.isAuthenticated, shouldRefresh, fetchDatasets]);

    /**
     * 手动刷新
     */
    const refresh = useCallback(async () => {
        await fetchDatasets();
    }, [fetchDatasets]);

    /**
     * 删除数据集
     */
    const deleteDataset = useCallback(async (filename: string): Promise<boolean> => {
        try {
            await api.deleteDataset(auth, filename);
            setDatasets(prev => prev.filter(d => d.filename !== filename && d.name !== filename));
            return true;
        } catch (err) {
            log('Delete error:', err);
            return false;
        }
    }, [auth, setDatasets]);

    /**
     * 纯下载文件（不检查购买状态，不扣费）
     * 用于批量下载中已经扣费和标记后的文件
     */
    const downloadFile = useCallback(async (filename: string): Promise<void> => {
        log('Downloading file:', filename);
        const blob = await api.downloadDataset(auth, filename);

        // 使用原生方法下载
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        log('Download success:', filename);
    }, [auth]);

    /**
     * 下载单个数据集（带购买检查和扣费）
     */
    const downloadDataset = useCallback(async (filename: string, showModalFn?: (filename: string) => Promise<boolean>) => {
        // 1. 防抖检查
        if (downloadingFiles.has(filename)) {
            log('File already downloading:', filename);
            return;
        }

        setDownloadingFiles(prev => new Set(prev).add(filename));

        try {
            // 2. 检查是否已购买
            log('Checking purchase status for:', filename);
            const isPurchased = await billing.checkPurchased(auth, filename);

            if (!isPurchased) {
                log('File not purchased, initiating purchase flow');

                // 3. 显示购买确认弹窗（必须提供）
                if (!showModalFn) {
                    throw new Error('未提供购买确认弹窗，无法继续');
                }

                const confirmed = await showModalFn(filename);
                if (!confirmed) {
                    log('User cancelled purchase');
                    throw new Error('用户取消购买');
                }

                // 4. 扣费
                log('Charging for download...');
                const chargeResult = await billing.chargeForDownload(1);

                if (!chargeResult.success) {
                    throw new Error(chargeResult.message);
                }

                log('Charge successful, marking as purchased');

                // 5. 标记已购买
                await billing.markAsPurchased(auth, [filename]);
            }

            // 6. 下载文件
            await downloadFile(filename);

        } catch (err) {
            log('Download error:', err);
            throw err;
        } finally {
            setDownloadingFiles(prev => {
                const next = new Set(prev);
                next.delete(filename);
                return next;
            });
        }
    }, [auth, downloadingFiles, downloadFile]);

    /**
     * 选中用于建模
     */
    const selectForModeling = useCallback((dataset: DatasetMeta) => {
        setSelectedDataForModel(dataset);
        localStorage.setItem('finance_selectedDataForModel', JSON.stringify(dataset));
        navigate('/model-building');
    }, [setSelectedDataForModel, navigate]);

    return {
        datasets,
        isLoading,
        error,
        isAuthenticated: auth.isAuthenticated,
        refresh,
        deleteDataset,
        downloadDataset,
        downloadFile,
        selectForModeling,
    };
}

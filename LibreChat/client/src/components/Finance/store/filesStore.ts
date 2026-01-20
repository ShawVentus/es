/**
 * Recoil 状态管理 - 金融模块数据集文件存储
 * 
 * 功能:
 * - 全局缓存用户的数据集列表
 * - 实现 5 分钟被动刷新策略
 * - 跨页面共享（我的数据 ↔ 模型构建）
 * - 独立于 LibreChat 状态系统
 * 
 * 创建日期: 2026-01-13
 * 迁移日期: 2026-01-18
 */

import { atom, selector } from 'recoil';
import type { DatasetMeta } from '../api/dataset';

// 缓存过期时间（5分钟）
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * 数据集列表状态
 */
export const datasetFilesState = atom<DatasetMeta[]>({
    key: 'finance/datasetFiles',  // 加前缀避免冲突
    default: [],
});

/**
 * 上次获取时间戳
 */
export const lastFetchTimeState = atom<number>({
    key: 'finance/lastFetchTime',
    default: 0,
});

/**
 * 是否正在加载
 */
export const isLoadingState = atom<boolean>({
    key: 'finance/isLoadingDatasets',
    default: false,
});

/**
 * 加载错误信息
 */
export const loadErrorState = atom<string | null>({
    key: 'finance/loadError',
    default: null,
});

/**
 * 选中用于建模的数据集
 */
export const selectedDataForModelState = atom<DatasetMeta | null>({
    key: 'finance/selectedDataForModel',
    default: null,
});

/**
 * 是否需要刷新（基于缓存过期判断）
 */
export const shouldRefreshSelector = selector<boolean>({
    key: 'finance/shouldRefresh',
    get: ({ get }) => {
        const lastFetch = get(lastFetchTimeState);
        if (lastFetch === 0) {
            // 从未获取过
            return true;
        }
        const now = Date.now();
        return (now - lastFetch) > CACHE_EXPIRY_MS;
    },
});

/**
 * 按分类统计的数量
 */
export const categoryCountsSelector = selector<Record<string, number>>({
    key: 'finance/categoryCounts',
    get: ({ get }) => {
        const files = get(datasetFilesState);
        const counts: Record<string, number> = {
            '全部': files.length,
        };

        for (const file of files) {
            const cat = file.category || 'Unknown';
            counts[cat] = (counts[cat] || 0) + 1;
        }

        return counts;
    },
});

/**
 * 金融模块 - 页面组件索引
 * 
 * 功能：
 * - 统一导出所有金融页面组件
 * - 使用懒加载优化性能
 * 
 * 创建日期: 2026-01-18
 */

import { lazy } from 'react';

// 懒加载页面组件
export const Home = lazy(() => import('./Home'));
export const MyData = lazy(() => import('./MyData'));

export const ModelBuilding = lazy(() => import('./ModelBuilding'));

export const ReportAnalysis = lazy(() => import('./ReportAnalysis'));

export const DataPreview = lazy(() => import('./DataPreview'));

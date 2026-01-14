/**
 * 文件功能：路由配置表
 * 创建日期：2026-01-13
 * 最后修改：2026-01-13
 * 
 * 说明：
 * - 定义应用的所有路由路径
 * - 使用 React.lazy 实现路由组件懒加载
 * - 配合 Suspense 实现按需加载
 */

import { lazy } from 'react';
import { RouteObject } from 'react-router-dom';

// 懒加载页面组件
const Home = lazy(() => import('../pages/home/page'));
const DataAcquisition = lazy(() => import('../pages/data-acquisition/page'));
const MyData = lazy(() => import('../pages/my-data/page'));
const ModelBuilding = lazy(() => import('../pages/model-building/page'));
const ReportAnalysis = lazy(() => import('../pages/report-analysis/page'));
const DataPreview = lazy(() => import('../pages/data-preview/page'));
const NotFound = lazy(() => import('../pages/NotFound'));

// 路由配置数组
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Home />
  },
  {
    path: '/data-acquisition',
    element: <DataAcquisition />
  },
  {
    path: '/my-data',
    element: <MyData />
  },
  {
    path: '/data-preview',
    element: <DataPreview />
  },
  {
    path: '/model-building',
    element: <ModelBuilding />
  },
  {
    path: '/report-analysis',
    element: <ReportAnalysis />
  },
  {
    path: '*',
    element: <NotFound />
  }
];

export default routes;

/**
 * 文件功能：404 页面组件
 * 创建日期：2026-01-13
 * 
 * 说明：
 * - 当访问不存在的路由时显示
 * - 提供返回首页的链接
 */

import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-200">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 mt-4 mb-2">页面未找到</h2>
        <p className="text-gray-500 mb-8">抱歉，您访问的页面不存在或已被移除。</p>
        <Link
          to="/"
          className="px-6 py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition-colors inline-flex items-center gap-2"
        >
          <i className="ri-home-4-line"></i>
          返回首页
        </Link>
      </div>
    </div>
  );
}

/**
 * 文件功能：路由导出与导航工具
 * 创建日期：2026-01-13
 * 最后修改：2026-01-13
 * 
 * 说明：
 * - 统一导出路由组件和工具函数
 * - 使用 useRoutes 钩子渲染路由
 * - 管理全局导航实例
 */

import { useNavigate } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import { useEffect } from "react";
import routes from "./config";

/**
 * 应用路由组件
 * @returns 渲染的路由元素
 */
export function AppRoutes() {
  const element = useRoutes(routes);
  const navigate = useNavigate();

  useEffect(() => {
    // 挂载到全局变量，方便调试
    if (typeof window !== 'undefined') {
      window.REACT_APP_NAVIGATE = navigate;
    }
  }, [navigate]);

  return element;
}

// 导出路由配置
export { default as routes } from './config';

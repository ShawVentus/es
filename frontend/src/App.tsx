/**
 * 文件功能：根组件
 * 创建日期：2026-01-13
 * 最后修改：2026-01-14
 * 
 * 说明：
 * - 应用的根组件，配置路由
 * - 使用 BrowserRouter 进行路由管理
 * - **集成更新**: 引入 LibreChatAuthProvider 和 AgentIframe
 */

import { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { LibreChatAuthProvider } from "./components/Auth/LibreChatAuth";
import AgentIframe from "./components/Agent/AgentIframe";
import ThemeEffect from "./components/common/ThemeEffect";

/**
 * 根组件
 * @returns React 元素
 */
function App() {
  return (
    <BrowserRouter basename="/">
      {/* 1. 全局认证上下文包裹 */}
      <LibreChatAuthProvider>

        {/* 2. 主题效果 - 更新全局CSS变量 */}
        <ThemeEffect />

        {/* 3. 顶部状态提示条 (移至各页面的 Header 组件中) */}

        {/* 4. 路由主内容 (Suspense 支持懒加载) */}
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="inline-block w-12 h-12 border-4 border-pink-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-600">加载中...</p>
            </div>
          </div>
        }>
          <AppRoutes />
        </Suspense>

        {/* 5. Agent 常驻容器 (Fixed Overlay) */}
        {/* 注意：它在 Suspense 之外，不受路由切换影响 */}
        <AgentIframe />

      </LibreChatAuthProvider>
    </BrowserRouter>
  );
}

export default App;

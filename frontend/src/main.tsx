/**
 * 文件功能：应用程序入口文件
 * 创建日期：2026-01-13
 * 最后修改：2026-01-13
 * 
 * 说明：
 * - React 应用的渲染入口
 * - 引入全局样式
 * - 挂载根组件到 DOM
 * - 集成 Recoil 状态管理
 * 
 * 修改记录：
 * - 已移除原项目的 i18n 国际化模块导入
 * - 添加 RecoilRoot 和 Toaster
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RecoilRoot } from 'recoil'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'

// 渲染根组件
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecoilRoot>
      <App />
      <Toaster
        position="top-right"
        containerStyle={{ top: '80px' }}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
    </RecoilRoot>
  </StrictMode>,
)


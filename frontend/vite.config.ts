/**
 * 文件功能：Vite 构建工具配置文件
 * 创建日期：2026-01-13
 * 最后修改：2026-01-13
 * 
 * 配置内容：
 * 1. React 插件支持
 * 2. 路径别名 @ -> src
 * 3. 开发服务器端口配置 (3001，避免与 V1 冲突)
 * 4. 代码分割优化
 * 
 * 修改记录：
 * - 使用相对路径配置别名，符合 ESM 标准
 * - 删除了未使用的全局变量定义
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // 路径别名配置
  resolve: {
    alias: {
      '@': '/src',  // Vite 会自动解析为项目根目录的 src
    },
  },
  
  // 开发服务器配置
  server: {
    port: 3001,  // 使用 3001 避免与 frontend (V1) 的 3000 端口冲突
    open: true,
  },
  
  // 构建配置
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 代码分割策略：将 React 相关库独立打包
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})

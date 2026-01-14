/// <reference types="vite/client" />

/**
 * 文件功能：Vite 环境类型声明
 * 创建日期：2026-01-13
 * 最后修改：2026-01-13
 * 
 * 说明：
 * - 定义 Vite 环境下的全局类型
 * - 扩展 Window 接口以支持全局导航变量
 */

// 扩展 Window 接口
declare global {
  interface Window {
    REACT_APP_NAVIGATE: any;
  }
}

export {};

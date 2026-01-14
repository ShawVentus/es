/**
 * 文件功能：Tailwind CSS 配置文件
 * 创建日期：2026-01-13
 * 
 * 说明：
 * - 配置内容扫描路径
 * - 扩展主题以支持 Pacifico 字体
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        pacifico: ['Pacifico', 'cursive'],
      },
    },
  },
  plugins: [],
}

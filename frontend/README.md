# 金融时序研究平台 V2

一个现代化的、专为计量经济学研究设计的 React 前端应用。提供数据获取、管理、建模到报告分析的全流程工具。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3001

### 3. 构建生产环境

```bash
npm run build
```

产物将输出到 `dist/` 目录。

## 🛠️ 技术栈

- **Core**: React 18, TypeScript, Vite 5
- **Routing**: React Router v6 (支持懒加载)
- **Styling**: Tailwind CSS 3
- **Data**: Mock 数据层 (src/mocks)
- **Theme**: 自定义主题系统 (src/hooks/useTheme.ts)

## 📂 目录结构

```
src/
├── pages/          # 页面组件 (Lazy Loaded)
├── router/         # 路由配置
├── mocks/          # Mock 数据源
├── hooks/          # 自定义 Hooks (useTheme)
├── components/     # 通用组件
├── assets/         # 静态资源
└── services/       # API 服务层 (Phase 2)
```

## ✨ 核心特性

- **多主题支持**: 内置 Pink, Blue, Green 等 6 种配色方案
- **响应式设计**: 完美适配移动端和桌面端
- **静态独立**: 脱离后端依赖，可独立部署演示
- **路由优化**: 全面采用路由懒加载 + Suspense 优化首屏性能

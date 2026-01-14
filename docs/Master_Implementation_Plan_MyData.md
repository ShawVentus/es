# “我的数据”页面功能开发与生产优化：完整执行计划与技术方案 (Master Plan)

## 0. 概述与核心理念

本计划定义了如何将一个金融时序研究平台的静态“数据集管理”页面转化为一个高可用、安全且具备智能分析能力的生产级应用。核心思路是 **“认证先行、数据隔离、体验闭环、部署规范”**。

---

## 阶段 1：基础设施与认证同步 (Auth Foundation)

### 1.1 需求与挑战
主应用与 Agent (LibreChat) 运行在不同的 Context（甚至是不同域名）中，需要确保主页面能感知 Iframe 内的登录状态。

### 1.2 问题
- 刷新页面后主应用无法得知 Iframe 是否已登录。
- Token 无法在两个域之间自动共享。

### 1.3 解决方案：双向同步协议
- **消息机制**：在 `AgentIframe.tsx` 中注入脚本，监听 `LibreChat` 的登录成功事件。
- **协议定义**：
  - `LOGIN_SUCCESS`: 包含 `user` 和 `token`。
  - `LOGOUT`: 通知清理状态。
- **持久化**：主应用接收消息后存入 `localStorage`，并在应用初始化时首先检查锁定的 `localStorage` 以恢复状态。

---

## 阶段 2：数据获取层开发 (Data Acquisition Layer)

### 2.1 需求
从后端 API 获取用户生成的文件列表。

### 2.2 问题
- 后端返回的是文件元数据，与前端 UI 框架所需的 `DataItem` 格式不一致。
- API 请求可能因为 Token 过期或跨域配置错误而失败。

### 2.3 解决方案：适配器与健壮性
- **接口定义**：实现 `GET /api/files/dataset`，返回文件路径、大小、创建时间。
- **转换适配器 (Adapter)**：编写 `apiFileToDataItem` 函数，将后端原始 JSON 对象映射为前端带图标、分类和状态的 UI 对象。
- **错误捕获**：实现详细的错误解析逻辑，能够解析后端返回的 `{ "error": "原因" }` 负载并友好展示给用户。

---

## 阶段 3：UI/UX 智能逻辑 (UI/UX Intelligence)

### 3.1 严格数据隔离 (Security Policy)
- **需求**：未登录用户只能看示例，登录用户只能看自己的数据。
- **实现方案**：
  ```typescript
  const allDataItems = isAuthenticated ? apiData : dataItems;
  ```
- **核心逻辑**：只要 `isAuthenticated` 为真，哪怕 `apiData` 为空，也绝对不展示 Mock 数据，而是展示“空状态引导”。

### 3.2 智能来源推断 (Market Heuristics)
- **需求**：文件名通常很枯燥（如 `historical_prices_...`），用户难以一眼看出数据源。
- **解决方案**：启发式前缀匹配逻辑。
  - **规则集**：
    - `NYSE_` / `NASDAQ_` $\rightarrow$ Yahoo Finance (US)
    - `SSE_` / `SZSE_` $\rightarrow$ 东方财富 (CN)
    - `HKEX_` $\rightarrow$ Yahoo Finance (HK)
    - `CRYPTO_` $\rightarrow$ Binance
- **效果**：自动在卡片 tags 中生成来源标签，提供专业背景。

### 3.3 交互式空状态
- **实现**：针对已登录但无数据的用户，设计 `EmptyState` 组件。
- **功能点**：包含渐变色按钮，点击直达“数据获取”模块，完成业务闭环。

---

## 阶段 4：批量处理工具集 (Advanced Utilities)

### 4.1 批量下载引擎
- **需求**：用户需要一次性导出多个数据集。
- **技术实现**：
  - **前端并发**：使用 `Promise.all` 映射 `fetch` 请求。
  - **内存打包**：集成 `JSZip`，在浏览器内存中完成压缩。
  - **多选交互**：设计“批量管理”模式，进入模式后卡片出现复选框，禁止选中示例数据。

### 4.2 错误反馈机制 (Fault Tolerance)
- **挑战**：部分文件下载由于链路问题可能失败。
- **优化方案**：
  - 使用 `failedFiles` 数组记录下载异常的文件名。
  - 任务结束时区分状态：
    - 全成功：直接保存 ZIP。
    - 部分成功：保存 ZIP，同时弹出警告框列出所有失败文件名。
    - 全失败：明确告知用户网络或权限异常。

---

## 阶段 5：生产构建与安全 (Production Hardening)

### 5.1 环境变量隔离
- **配置**：`.env.production`
- **内容**：
  - `VITE_AGENT_URL`: 生产后端绝对地址。
  - `VITE_DEBUG`: `false`，禁用详细调试日志。
- **意义**：确保代码在不同环境部署时无需手动修改源码。

### 5.2 安全加固
- **下载安全**：下载接口受 JWT 保护，后端通过私钥校验 userId。
- **路径遍历防护**：后端逻辑强制判断解析后的路径是否以用户专有数据目录开头（`resolvedPath.startsWith(userDatasetDir)`），杜绝 `../` 非法请求。

---

## 执行清单 (Checklist for Future)

- [ ] **初始化**：安装 `jszip` 和 `file-saver`。
- [ ] **认证**：配置 Iframe `postMessage` 通道。
- [ ] **转换器**：实现 `inferDataSource` 与 `apiFileToDataItem`。
- [ ] **UI层**：插入空状态逻辑与 Mock 徽章逻辑。
- [ ] **构建**：编写 `.env.production` 并执行 `npm run build`。
- [ ] **验证**：运行 `npx tsc --noEmit` 检查类型安全。

---
*本计划由 Antigravity AI 开发团队编制，可作为标准金融数据管理页面执行规范使用。*

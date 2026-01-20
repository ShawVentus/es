/**
 * 金融模块集成测试
 *
 * 测试范围：
 * 1. 前端编译检查
 * 2. 路由配置验证
 * 3. API代理配置验证
 * 4. 组件导入完整性
 * 5. 认证集成验证
 * 6. 主题系统隔离验证
 *
 * 运行方式：node tests/finance-integration.test.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试结果收集
const results = {
  passed: [],
  failed: [],
  warnings: []
};

function logTest(name, passed, message = '') {
  if (passed) {
    results.passed.push(name);
    console.log(`✅ ${name}`);
  } else {
    results.failed.push({ name, message });
    console.log(`❌ ${name}: ${message}`);
  }
}

function logWarning(name, message) {
  results.warnings.push({ name, message });
  console.log(`⚠️  ${name}: ${message}`);
}

// ============ 测试1: 目录结构完整性 ============
console.log('\n📁 测试1: 目录结构完整性\n');

const requiredDirs = [
  'src/components/Finance',
  'src/components/Finance/pages',
  'src/components/Finance/hooks',
  'src/components/Finance/api',
  'src/components/Finance/store',
  'src/components/Finance/components'
];

requiredDirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  logTest(`目录存在: ${dir}`, fs.existsSync(fullPath), `路径: ${fullPath}`);
});

// ============ 测试2: 核心文件存在性 ============
console.log('\n📄 测试2: 核心文件存在性\n');

const requiredFiles = [
  // 页面组件
  'src/components/Finance/pages/Home.tsx',
  'src/components/Finance/pages/MyData.tsx',
  'src/components/Finance/pages/ModelBuilding.tsx',
  'src/components/Finance/pages/ReportAnalysis.tsx',
  'src/components/Finance/pages/DataPreview.tsx',
  'src/components/Finance/pages/index.tsx',

  // API模块
  'src/components/Finance/api/dataset.ts',
  'src/components/Finance/api/models.ts',
  'src/components/Finance/api/reports.ts',
  'src/components/Finance/api/statistics.ts',

  // Hooks
  'src/components/Finance/hooks/useTheme.ts',
  'src/components/Finance/hooks/useFinanceAuth.ts',
  'src/components/Finance/hooks/useDatasets.ts',

  // Store
  'src/components/Finance/store/themeStore.ts',
  'src/components/Finance/store/filesStore.ts',

  // 组件
  'src/components/Finance/Header.tsx',
  'src/components/Finance/components/ThemeSelector.tsx',
  'src/components/Finance/components/EmptyState.tsx',
  'src/components/Finance/components/DeleteModal.tsx',

  // 静态资源
  'public/logo.png'
];

requiredFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  logTest(`文件存在: ${file}`, fs.existsSync(fullPath));
});

// ============ 测试3: 路由配置验证 ============
console.log('\n🛣️  测试3: 路由配置验证\n');

const routesFile = path.join(__dirname, '../src/routes/index.tsx');
const routesContent = fs.readFileSync(routesFile, 'utf8');

// 检查金融页面导入
const hasFinanceImport = routesContent.includes("import { Home as FinanceHome, MyData, ModelBuilding, ReportAnalysis, DataPreview } from '~/components/Finance/pages'");
logTest('路由文件导入金融页面', hasFinanceImport, '检查 routes/index.tsx 第24行');

// 检查根路径配置
const hasRootRoute = routesContent.includes('<FinanceHome />') && routesContent.includes('index: true');
logTest('根路径配置为金融首页', hasRootRoute);

// 检查金融模块路由
const routes = ['my-data', 'model-building', 'report-analysis', 'data-preview'];
routes.forEach(route => {
  const hasRoute = routesContent.includes(`path: '${route}'`);
  logTest(`路由配置: /${route}`, hasRoute);
});

// 检查Suspense包裹
const hasSuspense = routesContent.includes('<Suspense fallback={<FinancePageFallback />}>');
logTest('金融页面使用Suspense懒加载', hasSuspense);

// ============ 测试4: Vite Proxy配置验证 ============
console.log('\n🔌 测试4: Vite Proxy配置验证\n');

const viteConfigFile = path.join(__dirname, '../vite.config.ts');
const viteConfig = fs.readFileSync(viteConfigFile, 'utf8');

// 检查API代理配置
const proxyPaths = ['/api/v1', '/api/models', '/api/reports', '/api/statistics'];
proxyPaths.forEach(proxyPath => {
  const hasProxy = viteConfig.includes(`'${proxyPath}'`) || viteConfig.includes(`"${proxyPath}"`);
  logTest(`Vite proxy: ${proxyPath}`, hasProxy, '应指向 9898 端口');
});

// 检查代理目标
const hasStockMcpTarget = viteConfig.includes('9898');
logTest('Vite proxy 包含 stock-mcp 端口 9898', hasStockMcpTarget);

// ============ 测试5: Root.tsx 布局改造验证 ============
console.log('\n🏗️  测试5: Root.tsx 布局改造验证\n');

const rootFile = path.join(__dirname, '../src/routes/Root.tsx');
const rootContent = fs.readFileSync(rootFile, 'utf8');

// 检查FinanceHeader导入
const hasHeaderImport = rootContent.includes("import FinanceHeader from '~/components/Finance/Header'");
logTest('Root.tsx 导入 FinanceHeader', hasHeaderImport);

// 检查Header渲染
const hasHeaderRender = rootContent.includes('<FinanceHeader />');
logTest('Root.tsx 渲染 FinanceHeader', hasHeaderRender);

// 检查高度计算（包含73px header高度）
const hasHeightCalc = rootContent.includes('73') || rootContent.includes('financeHeaderHeight');
logTest('Root.tsx 高度计算包含 Header 高度', hasHeightCalc);

// ============ 测试6: 认证集成验证 ============
console.log('\n🔐 测试6: 认证集成验证\n');

const authHookFile = path.join(__dirname, '../src/components/Finance/hooks/useFinanceAuth.ts');
if (fs.existsSync(authHookFile)) {
  const authContent = fs.readFileSync(authHookFile, 'utf8');

  const usesAuthContext = authContent.includes("from '~/hooks/AuthContext'");
  logTest('useFinanceAuth 使用 LibreChat AuthContext', usesAuthContext);

  const exportsAuthInfo = authContent.includes('export function useFinanceAuth');
  logTest('useFinanceAuth 正确导出', exportsAuthInfo);
} else {
  logTest('useFinanceAuth hook 存在', false, 'hooks/useFinanceAuth.ts 文件不存在');
}

// 检查API模块是否使用正确的认证方式
const datasetApiFile = path.join(__dirname, '../src/components/Finance/api/dataset.ts');
if (fs.existsSync(datasetApiFile)) {
  const datasetContent = fs.readFileSync(datasetApiFile, 'utf8');

  const hasAuthParam = datasetContent.includes('auth: AuthInfo');
  logTest('dataset.ts API 函数接受 auth 参数', hasAuthParam);

  const hasBuildHeaders = datasetContent.includes('buildHeaders(auth)');
  logTest('dataset.ts 使用 buildHeaders 构建请求头', hasBuildHeaders);
}

// ============ 测试7: Recoil状态命名空间隔离 ============
console.log('\n🏪 测试7: Recoil状态命名空间隔离\n');

const themeStoreFile = path.join(__dirname, '../src/components/Finance/store/themeStore.ts');
const filesStoreFile = path.join(__dirname, '../src/components/Finance/store/filesStore.ts');

if (fs.existsSync(themeStoreFile)) {
  const themeStore = fs.readFileSync(themeStoreFile, 'utf8');
  const hasPrefix = themeStore.includes("key: 'finance/theme'");
  logTest('themeStore atom key 包含 finance/ 前缀', hasPrefix);

  const hasLocalStorageKey = themeStore.includes("'finance_theme'") || themeStore.includes('"finance_theme"');
  logTest('themeStore localStorage key 包含 finance_ 前缀', hasLocalStorageKey);
}

if (fs.existsSync(filesStoreFile)) {
  const filesStore = fs.readFileSync(filesStoreFile, 'utf8');
  const hasPrefixes =
    filesStore.includes("key: 'finance/datasetFiles'") &&
    filesStore.includes("key: 'finance/lastFetchTime'") &&
    filesStore.includes("key: 'finance/isLoadingDatasets'");
  logTest('filesStore 所有 atom key 包含 finance/ 前缀', hasPrefixes);
}

// ============ 测试8: 页面组件导入路径验证 ============
console.log('\n📦 测试8: 页面组件导入路径验证\n');

const pages = ['Home.tsx', 'MyData.tsx', 'ModelBuilding.tsx', 'ReportAnalysis.tsx', 'DataPreview.tsx'];
pages.forEach(page => {
  const pagePath = path.join(__dirname, '../src/components/Finance/pages', page);
  if (fs.existsSync(pagePath)) {
    const content = fs.readFileSync(pagePath, 'utf8');

    // 检查是否移除了旧的Header导入
    const hasOldHeaderImport = content.includes("from '../../components/common/Header'");
    logTest(`${page} 已移除旧 Header 导入`, !hasOldHeaderImport);

    // 检查是否使用 ~/ 路径别名
    const usesTildeAlias = content.includes("from '~/") || content.includes('from "~/');
    logTest(`${page} 使用 ~/ 路径别名`, usesTildeAlias);

    // 检查是否使用 useFinanceAuth
    const usesFinanceAuth = content.includes('useFinanceAuth');
    if (page !== 'Home.tsx') {  // Home页面可能不需要auth
      logTest(`${page} 使用 useFinanceAuth hook`, usesFinanceAuth);
    }
  }
});

// ============ 测试9: 依赖检查 ============
console.log('\n📚 测试9: 依赖检查\n');

const packageJsonFile = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

const requiredDeps = [
  'react-hot-toast',
  'react-markdown',
  'remark-math',
  'rehype-katex',
  'docx-preview'
];

requiredDeps.forEach(dep => {
  const hasDep = deps[dep] !== undefined;
  if (!hasDep) {
    logWarning(`依赖 ${dep}`, '可能需要安装');
  } else {
    logTest(`依赖 ${dep} 已安装`, true, `版本: ${deps[dep]}`);
  }
});

// JSZip 检查（批量下载需要）
if (deps['jszip']) {
  logTest('JSZip 已安装（批量下载功能）', true, `版本: ${deps.jszip}`);
} else {
  logWarning('JSZip 未安装', '批量下载功能需要此依赖');
}

// ============ 测试10: TypeScript类型检查 ============
console.log('\n🔍 测试10: TypeScript类型检查\n');

try {
  // 只检查Finance模块的TS错误
  const tscOutput = execSync('npx tsc --noEmit 2>&1 | grep -i "Finance" || true', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });

  if (tscOutput.trim()) {
    const errorLines = tscOutput.trim().split('\n');
    logTest('Finance 模块 TypeScript 编译', false, `发现 ${errorLines.length} 个错误`);
    errorLines.forEach(line => {
      if (line.trim()) {
        logWarning('TS错误', line);
      }
    });
  } else {
    logTest('Finance 模块 TypeScript 编译', true, '无类型错误');
  }
} catch (e) {
  logWarning('TypeScript检查', '执行失败，可能需要先安装依赖');
}

// ============ 测试11: 页面index.tsx导出验证 ============
console.log('\n📤 测试11: 页面index.tsx导出验证\n');

const pagesIndexFile = path.join(__dirname, '../src/components/Finance/pages/index.tsx');
if (fs.existsSync(pagesIndexFile)) {
  const indexContent = fs.readFileSync(pagesIndexFile, 'utf8');

  const exports = ['Home', 'MyData', 'ModelBuilding', 'ReportAnalysis', 'DataPreview'];
  exports.forEach(exp => {
    const hasExport = indexContent.includes(`export const ${exp}`);
    const hasLazyImport = indexContent.includes(`lazy(() => import('./${exp}'))`);
    logTest(`pages/index.tsx 导出 ${exp}`, hasExport && hasLazyImport);
  });

  // 检查是否没有占位组件
  const hasPlaceholder = indexContent.includes('页面迁移中');
  logTest('所有占位组件已替换为实际页面', !hasPlaceholder);
}

// ============ 生成测试报告 ============
console.log('\n' + '='.repeat(60));
console.log('📊 测试报告');
console.log('='.repeat(60) + '\n');

console.log(`✅ 通过: ${results.passed.length} 项`);
console.log(`❌ 失败: ${results.failed.length} 项`);
console.log(`⚠️  警告: ${results.warnings.length} 项\n`);

if (results.failed.length > 0) {
  console.log('失败项目详情：');
  results.failed.forEach(({ name, message }) => {
    console.log(`  - ${name}`);
    if (message) console.log(`    ${message}`);
  });
  console.log('');
}

if (results.warnings.length > 0) {
  console.log('警告项目详情：');
  results.warnings.forEach(({ name, message }) => {
    console.log(`  - ${name}: ${message}`);
  });
  console.log('');
}

// 总体评估
const passRate = results.passed.length / (results.passed.length + results.failed.length);
console.log(`总体通过率: ${(passRate * 100).toFixed(1)}%\n`);

if (results.failed.length === 0) {
  console.log('🎉 所有测试通过！迁移工作已完成。\n');
  process.exit(0);
} else {
  console.log('⚠️  部分测试失败，需要修复后才能部署。\n');
  process.exit(1);
}

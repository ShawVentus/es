/**
 * 文件功能：构建验证测试脚本
 * 创建日期：2026-01-13
 * 
 * 说明：
 * - 验证 dist 目录是否存在
 * - 验证关键产物文件是否生成
 */

import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');

console.log('开始验证构建产物...');

if (!fs.existsSync(distDir)) {
  console.error('❌ 构建失败：dist 目录不存在');
  process.exit(1);
}

const requiredFiles = ['index.html', 'assets', 'logo.png'];
let hasError = false;

requiredFiles.forEach(file => {
  if (!fs.existsSync(path.join(distDir, file))) {
    console.error(`❌ 缺少文件：${file}`);
    hasError = true;
  }
});

if (hasError) {
  process.exit(1);
}

console.log('✅ 构建产物验证通过！');

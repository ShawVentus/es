// 检查 react-hot-toast 默认 z-index
const fs = require('fs');
const path = require('path');

// 查找 react-hot-toast 源码中的 z-index 配置
const toastDir = path.join(__dirname, 'node_modules', 'react-hot-toast', 'dist');

function searchZIndex(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.mjs'))) {
      const content = fs.readFileSync(filePath, 'utf8');
      const zIndexMatch = content.match(/z-?[iI]ndex\s*[:=]\s*(\d+)/g);
      
      if (zIndexMatch) {
        console.log(`\n文件: ${file}`);
        console.log('找到的 z-index:');
        zIndexMatch.forEach(match => console.log('  ' + match));
      }
    }
  });
}

if (fs.existsSync(toastDir)) {
  console.log('=== react-hot-toast 默认 z-index 配置 ===');
  searchZIndex(toastDir);
} else {
  console.log('未找到 react-hot-toast 目录');
}

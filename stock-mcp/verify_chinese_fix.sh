#!/bin/bash
# 快速验证中文字体修复脚本

set -e

echo "=========================================="
echo "Matplotlib中文字体修复验证"
echo "=========================================="
echo ""

# 使用项目内 venv（不依赖 conda）
cd "$(dirname "$0")"
PYTHON_BIN="${STOCK_MCP_PYTHON:-$(pwd)/.venv/bin/python}"
if [ ! -x "$PYTHON_BIN" ]; then
  echo "stock-mcp Python not found: $PYTHON_BIN" >&2
  echo "Run: STOCK_MCP_BASE_PYTHON=/path/to/python3.11 bash ../deploy/setup.sh" >&2
  exit 1
fi

# 运行测试
echo "运行测试脚本..."
"$PYTHON_BIN" test_chinese_font.py 2>&1 | grep -E "成功|失败|总计|图片保存目录" | tail -20

echo ""
echo "=========================================="
echo "验证完成！"
echo "=========================================="
echo ""
echo "如果看到 '6/7 通过' 或更高，说明修复成功。"
echo "请手动打开 /tmp/final_test_* 或 /tmp/chart_test_* 目录中的PNG图片"
echo "确认中文字符显示正常（非方框）。"

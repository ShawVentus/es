#!/bin/bash
# 快速验证中文字体修复脚本

set -e

echo "=========================================="
echo "Matplotlib中文字体修复验证"
echo "=========================================="
echo ""

# 激活conda环境
source ~/.bashrc
conda activate stock-mcp

# 运行测试
echo "运行测试脚本..."
python test_chinese_font.py 2>&1 | grep -E "成功|失败|总计|图片保存目录" | tail -20

echo ""
echo "=========================================="
echo "验证完成！"
echo "=========================================="
echo ""
echo "如果看到 '6/7 通过' 或更高，说明修复成功。"
echo "请手动打开 /tmp/final_test_* 或 /tmp/chart_test_* 目录中的PNG图片"
echo "确认中文字符显示正常（非方框）。"

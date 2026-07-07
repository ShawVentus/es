#!/usr/bin/env zsh
# ------------------------------------------------------------
#  MCP stdio 启动脚本 – 适配 VS Code/LocalProcess
# ------------------------------------------------------------

# 切换到脚本所在目录（项目根目录）
cd "$(dirname "$0")"

# 确保 src 包在 PYTHONPATH
export PYTHONPATH=$(pwd)
mkdir -p logs
STOCK_MCP_PYTHON="${STOCK_MCP_PYTHON:-$(pwd)/.venv/bin/python}"

if [ ! -x "$STOCK_MCP_PYTHON" ]; then
  echo "stock-mcp Python not found: $STOCK_MCP_PYTHON" >&2
  echo "Run: STOCK_MCP_BASE_PYTHON=/path/to/python3.11 bash ../deploy/setup.sh" >&2
  exit 1
fi

# 启动 FastMCP（阻塞），使用 stdio 传输
"$STOCK_MCP_PYTHON" -c "import src.server.mcp.server as m; m.create_mcp_server().run(transport='stdio')"

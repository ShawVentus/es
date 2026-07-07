#!/usr/bin/env bash
# ------------------------------------------------------------
#  MCP HTTP Start Script
# ------------------------------------------------------------

# Switch to the script's directory (project root)
cd "$(dirname "$0")"

# Ensure src package is in PYTHONPATH
export PYTHONPATH=$(pwd)
mkdir -p logs
STOCK_MCP_PYTHON="${STOCK_MCP_PYTHON:-$(pwd)/.venv/bin/python}"

if [ ! -x "$STOCK_MCP_PYTHON" ]; then
  echo "stock-mcp Python not found: $STOCK_MCP_PYTHON" >&2
  echo "Run: STOCK_MCP_BASE_PYTHON=/path/to/python3.11 bash ../deploy/setup.sh" >&2
  exit 1
fi

# Set transport to HTTP
export MCP_TRANSPORT=streamable-http

# Start FastMCP (HTTP mode)
"$STOCK_MCP_PYTHON" -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898

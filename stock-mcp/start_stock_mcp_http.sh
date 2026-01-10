#!/usr/bin/env bash
# ------------------------------------------------------------
#  MCP HTTP Start Script
# ------------------------------------------------------------

# Switch to the script's directory (project root)
cd "$(dirname "$0")"

# Load conda (non-interactive)
export CONDA_BASE=$(conda info --base)
source "${CONDA_BASE}/etc/profile.d/conda.sh"

# Activate the project's conda environment
conda activate stock-mcp

# Ensure src package is in PYTHONPATH
export PYTHONPATH=$(pwd)

# Set transport to HTTP
export MCP_TRANSPORT=streamable-http

# Start FastMCP (HTTP mode)
python -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898

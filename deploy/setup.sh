#!/usr/bin/env bash
# ============================================================
# setup.sh - 一键环境配置脚本
# 用途：安装 MongoDB, Redis, Python/Node 依赖
# 日志：${ES_ROOT}/deploy/logs/setup.log
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_ROOT="${ES_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-${ES_ROOT}/deploy/logs}"
STOCK_MCP_DIR="${STOCK_MCP_DIR:-${ES_ROOT}/stock-mcp}"
STOCK_MCP_VENV="${STOCK_MCP_VENV:-${STOCK_MCP_DIR}/.venv}"
STOCK_MCP_PYTHON_VERSION_MIN="${STOCK_MCP_PYTHON_VERSION_MIN:-3.10}"
LIBRECHAT_DIR="${LIBRECHAT_DIR:-${ES_ROOT}/LibreChat}"
FRONTEND_DIR="${FRONTEND_DIR:-${ES_ROOT}/frontend}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/setup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "===== 开始环境配置 ====="

# 0. 配置镜像源（加速下载）
log "配置国内镜像源 (NPM, PIP)..."
npm config set registry https://registry.npmmirror.com
if command -v pip >/dev/null 2>&1; then
    pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ || true
elif command -v pip3 >/dev/null 2>&1; then
    pip3 config set global.index-url https://mirrors.aliyun.com/pypi/simple/ || true
fi
log "镜像源配置完成"

# 0.1 配置 System APT 镜像源 (如 Ubuntu 24.04 noble)
if command -v apt-get >/dev/null 2>&1; then
log "切换 Ubuntu 系统源到阿里云..."
if [ -w /etc/apt ] && [ ! -f /etc/apt/sources.list.bak ]; then
    cp /etc/apt/sources.list /etc/apt/sources.list.bak
    cat > /etc/apt/sources.list <<EOF
deb https://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse
EOF
fi
else
    log "非 apt 环境，跳过系统源/MongoDB/Redis/Nginx 自动安装"
fi

# 1. 安装 MongoDB (Aliyun Mirror)
if command -v mongod >/dev/null 2>&1; then
    log "MongoDB 已安装，跳过"
elif ! command -v apt-get >/dev/null 2>&1; then
    log "MongoDB 未安装，且当前不是 apt 环境；请自行安装或只运行不依赖 MongoDB 的子服务"
else
    log "安装 MongoDB (阿里云镜像)..."
    apt-get install -y gnupg curl >> "$LOG_FILE" 2>&1
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
       gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
       --dearmor >> "$LOG_FILE" 2>&1

    # 使用阿里云镜像 (Ubuntu 22.04 jammy 代替 noble，兼容性更好且镜像全)
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://mirrors.aliyun.com/mongodb/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
       tee /etc/apt/sources.list.d/mongodb-org-7.0.list >> "$LOG_FILE" 2>&1

    apt-get update >> "$LOG_FILE" 2>&1
    apt-get install -y mongodb-org >> "$LOG_FILE" 2>&1
    log "MongoDB 安装完成"
fi
# 容器环境无 systemd，跳过 systemctl 启动
mkdir -p "${ES_ROOT}/deploy/mongodb-data" "$LOG_DIR"
mkdir -p "${ES_ROOT}/librechat_user_data"

# 2. 安装 Redis
if command -v redis-server >/dev/null 2>&1; then
    log "Redis 已安装，跳过"
elif ! command -v apt-get >/dev/null 2>&1; then
    log "Redis 未安装，且当前不是 apt 环境；请自行安装或只运行不依赖 Redis 的子服务"
else
    log "安装 Redis..."
    apt-get install -y redis-server >> "$LOG_FILE" 2>&1
    log "Redis 安装完成"
fi

# 2.1 安装 Nginx（统一端口代理）
if command -v nginx >/dev/null 2>&1; then
    log "Nginx 已安装，跳过"
elif ! command -v apt-get >/dev/null 2>&1; then
    log "Nginx 未安装，且当前不是 apt 环境；请自行安装 nginx 后再运行统一入口"
else
    log "安装 Nginx..."
    apt-get install -y nginx >> "$LOG_FILE" 2>&1
    log "Nginx 安装完成"
fi

# 2.2 安装中文字体（Matplotlib 报告图表需要）
if ! command -v apt-get >/dev/null 2>&1; then
    log "非 apt 环境，跳过中文字体自动安装；请确保系统存在 Heiti/PingFang/WenQuanYi/Noto CJK 等中文字体"
elif fc-list :lang=zh >/dev/null 2>&1 && [ -n "$(fc-list :lang=zh 2>/dev/null | head -n 1)" ]; then
    log "系统已检测到中文字体，跳过安装"
else
    log "安装中文字体包（用于报告图表中文显示）..."
    apt-get update >> "$LOG_FILE" 2>&1
    apt-get install -y fontconfig fonts-wqy-zenhei fonts-noto-cjk >> "$LOG_FILE" 2>&1
    fc-cache -fv >> "$LOG_FILE" 2>&1 || true
    log "中文字体安装完成"
fi

# 3. 创建 stock-mcp 项目内 venv（不使用 conda）
cd "$STOCK_MCP_DIR"
find_python() {
    if [ -n "${STOCK_MCP_BASE_PYTHON:-}" ] && command -v "$STOCK_MCP_BASE_PYTHON" >/dev/null 2>&1; then
        command -v "$STOCK_MCP_BASE_PYTHON"
        return 0
    fi

    for candidate in python3.12 python3.11 python3.10 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            local path
            path="$(command -v "$candidate")"
            if "$path" - <<'PY'
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
            then
                echo "$path"
                return 0
            fi
        fi
    done
    return 1
}

BASE_PYTHON="$(find_python || true)"
if [ -z "$BASE_PYTHON" ]; then
    log "❌ 未找到 Python ${STOCK_MCP_PYTHON_VERSION_MIN}+；请先安装 python3.10+，或设置 STOCK_MCP_BASE_PYTHON=/path/to/python"
    exit 1
fi

log "使用 Python 创建/更新 stock-mcp venv: $BASE_PYTHON -> $STOCK_MCP_VENV"
if [ ! -x "$STOCK_MCP_VENV/bin/python" ]; then
    "$BASE_PYTHON" -m venv "$STOCK_MCP_VENV"
fi
mkdir -p "$STOCK_MCP_DIR/logs"
"$STOCK_MCP_VENV/bin/python" -m pip install --upgrade pip >> "$LOG_FILE" 2>&1
"$STOCK_MCP_VENV/bin/python" -m pip install -r requirements.txt >> "$LOG_FILE" 2>&1
log "stock-mcp venv 依赖安装完成"

# 4. 安装 LibreChat npm 依赖
log "检查 LibreChat npm 依赖..."
cd "$LIBRECHAT_DIR"
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    log "LibreChat .env 不存在，从 .env.example 复制"
    cp .env.example .env
fi
if [ -f ".env" ]; then
    log "修正 LibreChat 本地监听与 Meilisearch 地址"
    python3 - <<'PY'
from pathlib import Path
p = Path(".env")
s = p.read_text()
replacements = {
    "HOST=localhost": "HOST=0.0.0.0",
    "MEILI_HOST=http://meilisearch:7700 # Not used but keeping format": "MEILI_HOST=http://127.0.0.1:7700",
    "MEILI_HOST=http://meilisearch:7700": "MEILI_HOST=http://127.0.0.1:7700",
}
for old, new in replacements.items():
    s = s.replace(old, new)
p.write_text(s)
PY
fi
if [ -d "node_modules" ]; then
    log "LibreChat node_modules 已存在，跳过安装"
else
    log "安装 LibreChat npm 依赖..."
    npm ci --ignore-scripts >> "$LOG_FILE" 2>&1
    log "LibreChat 依赖安装完成"
fi

# 5. 构建 LibreChat workspace packages + 前端
if [ ! -d "packages/api/dist" ] || [ ! -d "packages/data-schemas/dist" ] || [ ! -d "packages/data-provider/dist" ]; then
    log "构建 LibreChat workspace packages..."
    npm run build:packages >> "$LOG_FILE" 2>&1
    log "LibreChat packages 构建完成"
fi

if [ ! -d "client/dist" ]; then
    log "构建 LibreChat client/dist（可能需要几分钟）..."
    npm run build:client >> "$LOG_FILE" 2>&1
    log "LibreChat client 构建完成"
else
    log "LibreChat 前端构建已存在，跳过构建"
fi

# 6. 构建前端静态文件（finance-research-platform）
log "构建前端静态文件（$FRONTEND_DIR）..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    log "安装前端依赖..."
    npm install --package-lock=false >> "$LOG_FILE" 2>&1
fi
FRONTEND_ENV_CHANGED=0
if [ ! -f ".env" ]; then
    log "前端 .env 不存在，写入本地 LibreChat 入口"
    cat > .env <<'EOF'
VITE_AGENT_URL=/librechat/
EOF
    FRONTEND_ENV_CHANGED=1
elif grep -q '^VITE_AGENT_URL=' .env && ! grep -qx 'VITE_AGENT_URL=/librechat/' .env; then
    log "更新前端 VITE_AGENT_URL 为 /librechat/（避免 /librechat 无斜杠跳转丢端口）"
    python3 - <<'PYEOF'
from pathlib import Path
p = Path('.env')
lines = p.read_text().splitlines()
updated = []
for line in lines:
    if line.startswith('VITE_AGENT_URL='):
        updated.append('VITE_AGENT_URL=/librechat/')
    else:
        updated.append(line)
p.write_text('\n'.join(updated) + '\n')
PYEOF
    FRONTEND_ENV_CHANGED=1
elif ! grep -q '^VITE_AGENT_URL=' .env; then
    log "前端 .env 缺少 VITE_AGENT_URL，追加 /librechat/"
    printf '\nVITE_AGENT_URL=/librechat/\n' >> .env
    FRONTEND_ENV_CHANGED=1
fi
if [ ! -d "dist" ] || [ "$FRONTEND_ENV_CHANGED" = "1" ]; then
    log "构建前端..."
    npm run build >> "$LOG_FILE" 2>&1
    log "前端构建完成"
else
    log "前端 dist 已存在且环境未变化，跳过构建"
fi

log "===== 环境配置完成 ====="
log "请运行 ${ES_ROOT}/deploy/start.sh 启动服务"

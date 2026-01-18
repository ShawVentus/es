#!/usr/bin/env bash
# ============================================================
# setup.sh - 一键环境配置脚本
# 用途：安装 MongoDB, Redis, Python/Node 依赖
# 日志：/root/deploy/logs/setup.log
# ============================================================

set -e
LOG_DIR="/root/deploy/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/setup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "===== 开始环境配置 ====="

# 0. 配置镜像源（加速下载）
log "配置国内镜像源 (NPM, PIP)..."
npm config set registry https://registry.npmmirror.com
pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
log "镜像源配置完成"

# 0.1 配置 System APT 镜像源 (如 Ubuntu 24.04 noble)
log "切换 Ubuntu 系统源到阿里云..."
if [ ! -f /etc/apt/sources.list.bak ]; then
    cp /etc/apt/sources.list /etc/apt/sources.list.bak
    cat > /etc/apt/sources.list <<EOF
deb https://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse
deb https://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse
EOF
fi

# 1. 安装 MongoDB (Aliyun Mirror)
if command -v mongod >/dev/null 2>&1; then
    log "MongoDB 已安装，跳过"
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
mkdir -p /data/db
mkdir -p /var/log/mongodb

# 2. 安装 Redis
if command -v redis-server >/dev/null 2>&1; then
    log "Redis 已安装，跳过"
else
    log "安装 Redis..."
    apt-get install -y redis-server >> "$LOG_FILE" 2>&1
    log "Redis 安装完成"
fi

# 2.1 安装 Nginx（统一端口代理）
if command -v nginx >/dev/null 2>&1; then
    log "Nginx 已安装，跳过"
else
    log "安装 Nginx..."
    apt-get install -y nginx >> "$LOG_FILE" 2>&1
    log "Nginx 安装完成"
fi

# 3. 创建 stock-mcp conda 环境
cd /root/stock-mcp
source $(conda info --base)/etc/profile.d/conda.sh
if conda env list | grep -q "^stock-mcp "; then
    log "stock-mcp 环境已存在，跳过创建"
    conda activate stock-mcp
    log "更新 stock-mcp 依赖..."
    pip install -r requirements.txt >> "$LOG_FILE" 2>&1
else
    log "创建 stock-mcp conda 环境..."
    conda create -n stock-mcp python=3.12 -y >> "$LOG_FILE" 2>&1
    conda activate stock-mcp
    pip install -r requirements.txt >> "$LOG_FILE" 2>&1
    log "stock-mcp 环境创建完成"
fi

# 4. 安装 LibreChat npm 依赖
log "检查 LibreChat npm 依赖..."
cd /root/LibreChat
if [ -d "node_modules" ]; then
    log "LibreChat node_modules 已存在，跳过安装"
else
    log "安装 LibreChat npm 依赖..."
    npm install >> "$LOG_FILE" 2>&1
    log "LibreChat 依赖安装完成"
fi

# 5. 检查并构建 LibreChat 前端
if [ ! -d "client/dist" ]; then
    log "警告：LibreChat client/dist 不存在，开始构建前端（可能需要几分钟）..."
    npm run frontend >> "$LOG_FILE" 2>&1
    log "LibreChat 前端构建完成"
else
    log "LibreChat 前端构建已存在，跳过构建"
fi

# 6. 构建前端静态文件（finance-research-platform）
log "构建前端静态文件（/root/frontend）..."
cd /root/frontend
if [ ! -d "node_modules" ]; then
    log "安装前端依赖..."
    npm install >> "$LOG_FILE" 2>&1
fi
if [ ! -d "dist" ]; then
    log "构建前端..."
    npm run build >> "$LOG_FILE" 2>&1
    log "前端构建完成"
else
    log "前端 dist 已存在，跳过构建"
fi

log "===== 环境配置完成 ====="
log "请运行 /root/deploy/start.sh 启动服务"

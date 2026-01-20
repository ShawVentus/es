#!/usr/bin/env bash
# ============================================================
# start.sh - 一键启动脚本
# 服务：Clash、MongoDB、Redis、Meilisearch、stock-mcp、LibreChat
# 日志：/root/deploy/logs/
# ============================================================

# 注意：不使用 set -e，因为某些命令（如 mongod --fork）可能返回非零但实际成功

LOG_DIR="/root/deploy/logs"
mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_port() {
    (echo > /dev/tcp/127.0.0.1/$1) >/dev/null 2>&1
}

# 诊断日志输出函数
print_diagnosis() {
    local name=$1 port=$2 log_file=$3 process_pattern=$4
    
    log "❌ $name 启动失败！以下是诊断信息："
    log "===== $name 日志最后 30 行 ====="
    if [ -n "$log_file" ] && [ -f "$log_file" ]; then
        tail -30 "$log_file" 2>/dev/null
    else
        log "(日志文件 $log_file 不存在)"
    fi
    log "===== 进程状态 ====="
    if [ -n "$process_pattern" ]; then
        ps aux | grep "$process_pattern" | grep -v grep || log "($name 进程不存在)"
    fi
    log "===== 端口 $port 状态 ====="
    netstat -tlnp 2>/dev/null | grep ":$port " || log "(端口 $port 未监听)"
    log "================================="
}

wait_for_port() {
    local port=$1 name=$2 timeout=${3:-60} log_file=${4:-""} process_pattern=${5:-""}
    local elapsed=0
    while ! check_port "$port"; do
        sleep 2
        elapsed=$((elapsed + 2))
        if [ $elapsed -ge $timeout ]; then
            log "⚠️  $name 启动超时（${timeout}秒）"
            print_diagnosis "$name" "$port" "$log_file" "$process_pattern"
            exit 1
        fi
    done
    log "✅ $name 已就绪 (端口 $port)"
}

# ============================================================
# 第一梯队：基础服务
# ============================================================
log "========== 启动基础服务 =========="

# 1. Clash
if ! check_port 7897; then
    log "启动 Clash..."
    /root/clash/scripts/proxy.sh start >/dev/null 2>&1 &
else
    log "✅ Clash 已运行"
fi

# 2. MongoDB（健壮版：启动 + 确认 + 详细日志）
start_mongodb() {
    log "启动 MongoDB..."
    mkdir -p /data/db /var/log/mongodb
    rm -f /data/db/mongod.lock /data/db/WiredTiger.lock
    
    # 尝试启动（忽略 fork 的退出码，因为有时会误报）
    mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /data/db --bind_ip 127.0.0.1 2>&1 || true
    
    # 等待端口确认启动成功（最多30秒）
    local attempt=0
    while [ $attempt -lt 15 ]; do
        if check_port 27017; then
            log "✅ MongoDB 启动成功 (端口 27017)"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    # 启动失败，输出详细诊断日志
    log "❌ MongoDB 启动失败！以下是诊断信息："
    log "===== mongod.log 最后 30 行 ====="
    tail -30 /var/log/mongodb/mongod.log 2>/dev/null || log "(日志文件不存在)"
    log "===== 进程状态 ====="
    ps aux | grep mongod | grep -v grep || log "(mongod 进程不存在)"
    log "===== 端口状态 ====="
    netstat -tlnp 2>/dev/null | grep 27017 || log "(端口 27017 未监听)"
    log "===== 数据目录状态 ====="
    ls -la /data/db/ 2>/dev/null | head -10 || log "(数据目录不存在)"
    log "================================="
    exit 1
}

if ! pgrep -x mongod >/dev/null; then
    start_mongodb
else
    log "✅ MongoDB 已运行"
fi

# 3. Redis
if ! pgrep -x redis-server >/dev/null; then
    log "启动 Redis..."
    redis-server --daemonize yes --logfile "$LOG_DIR/redis.log"
else
    log "✅ Redis 已运行"
fi

# 4. Meilisearch
if ! check_port 7700; then
    log "启动 Meilisearch..."
    nohup /root/meilisearch --master-key masterKey --http-addr 0.0.0.0:7700 --db-path /root/deploy/data.ms >"$LOG_DIR/meilisearch.log" 2>&1 &
else
    log "✅ Meilisearch 已运行"
fi

# 等待基础服务就绪（MongoDB 已在 start_mongodb 函数内确认）
wait_for_port 6379 "Redis" 30 "$LOG_DIR/redis.log" "redis-server"
wait_for_port 7700 "Meilisearch" 30 "$LOG_DIR/meilisearch.log" "meilisearch"

# ============================================================
# 第二梯队：应用服务
# ============================================================
log "========== 启动应用服务 =========="

# 5. stock-mcp (9898)
pkill -f "uvicorn.*9898" 2>/dev/null || true
sleep 1
log "启动 stock-mcp..."
cd /root/stock-mcp
MCP_TRANSPORT=streamable-http PYTHONPATH=/root/stock-mcp \
    nohup /opt/mamba/envs/stock-mcp/bin/python -m uvicorn src.server.app:app \
    --host 0.0.0.0 --port 9898 >>"$LOG_DIR/stock-mcp.log" 2>&1 &

# 6. LibreChat (3080)
pkill -f "node.*LibreChat" 2>/dev/null || true
sleep 1
log "启动 LibreChat..."
cd /root/LibreChat
nohup npm run backend >>"$LOG_DIR/librechat.log" 2>&1 &

# 等待应用服务就绪
wait_for_port 9898 "stock-mcp" 60 "$LOG_DIR/stock-mcp.log" "uvicorn.*9898"
wait_for_port 3080 "LibreChat" 120 "$LOG_DIR/librechat.log" "node.*LibreChat"

# ============================================================
# 启动完成
# ============================================================
log "=========================================="
log "        ✅ 所有服务启动完成"
log "=========================================="
log "【访问地址】"
log "  LibreChat (前端): http://0.0.0.0:3080"
log "  stock-mcp (后端): http://127.0.0.1:9898"
log ""
log "【日志目录】: $LOG_DIR"
log "=========================================="

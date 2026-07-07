#!/usr/bin/env bash
# ============================================================
# start.sh - 一键启动脚本（并行优化版）
# 第一批并行：Clash、MongoDB、Redis、Meilisearch、前端
# 第二批条件启动：stock-mcp、LibreChat
# 日志：${ES_ROOT}/deploy/logs/
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_ROOT="${ES_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-${ES_ROOT}/deploy/logs}"
MONGO_DB_PATH="${MONGO_DB_PATH:-${ES_ROOT}/deploy/mongodb-data}"
MONGO_LOG="${MONGO_LOG:-$LOG_DIR/mongod.log}"
MEILISEARCH_BIN="${MEILISEARCH_BIN:-$(command -v meilisearch || true)}"
MEILISEARCH_DATA_PATH="${MEILISEARCH_DATA_PATH:-${ES_ROOT}/deploy/meili-data.ms}"
STOCK_MCP_PYTHON="${STOCK_MCP_PYTHON:-${ES_ROOT}/stock-mcp/.venv/bin/python}"
mkdir -p "$LOG_DIR"
LIBRECHAT_CONFIG="${LIBRECHAT_CONFIG:-${ES_ROOT}/LibreChat/config/librechat.stock-mcp.yaml}"
STARTUP_LOG="$LOG_DIR/startup.log"
PROXY_LOG="$LOG_DIR/proxy.log"
PROXY_HOST="127.0.0.1"
PROXY_PORT="7897"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STARTUP_LOG"
}

log_proxy() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$PROXY_LOG"
}

check_port() {
    local host="$1"
    local port="$2"

    if command -v nc >/dev/null 2>&1; then
        nc -z -w 2 "$host" "$port" >/dev/null 2>&1
        return $?
    fi

    if command -v netstat >/dev/null 2>&1; then
        if netstat -lnt 2>/dev/null | awk '{print $4}' | grep -q "${host}:${port}"; then
            return 0
        fi
        if [ "$host" = "127.0.0.1" ]; then
            netstat -lnt 2>/dev/null | awk '{print $4}' | grep -q "0.0.0.0:${port}"
            return $?
        fi
        return 1
    fi

    if command -v timeout >/dev/null 2>&1; then
        timeout 2 bash -c "cat < /dev/tcp/${host}/${port}" >/dev/null 2>&1
        return $?
    fi

    bash -c "cat < /dev/tcp/${host}/${port}" >/dev/null 2>&1
}

start_detached() {
    local cwd="$1"
    local log_file="$2"
    shift 2

    local python_bin="${DETACH_PYTHON:-$(command -v python3 || command -v python || true)}"

    mkdir -p "$(dirname "$log_file")"

    if [ -z "$python_bin" ]; then
        (
            cd "$cwd" || exit 1
            nohup "$@" >> "$log_file" 2>&1 < /dev/null &
            echo $!
        )
        return
    fi

    "$python_bin" - "$cwd" "$log_file" "$@" <<'PY'
import os
import subprocess
import sys

cwd = sys.argv[1]
log_file = sys.argv[2]
cmd = sys.argv[3:]

os.makedirs(os.path.dirname(log_file), exist_ok=True)
log = open(log_file, "ab", buffering=0)
process = subprocess.Popen(
    cmd,
    cwd=cwd,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    close_fds=True,
    start_new_session=True,
    env=os.environ.copy(),
)
print(process.pid)
PY
}

wait_for_http() {
    local url="$1"
    local name="$2"
    local retries=20
    local attempt=1

    while [ "$attempt" -le "$retries" ]; do
        if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
            log "$name 健康检查通过"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 5
    done

    log "$name 健康检查失败: $url"
    return 1
}

# ============================================================
# 第一批：并行启动基础服务 + 前端
# ============================================================
log "========== 第一批：并行启动基础服务 =========="

# 1. 启动 Clash（如果未运行）
if ! check_port "$PROXY_HOST" "$PROXY_PORT"; then
    log "启动 Clash 代理..."
    CLASH_START_SCRIPT="${CLASH_START_SCRIPT:-${ES_ROOT}/clash/scripts/proxy.sh}"
    if [ -x "$CLASH_START_SCRIPT" ]; then
        "$CLASH_START_SCRIPT" start &
    else
        log "⚠️  Clash 启动脚本不存在，跳过代理启动"
    fi
else
    log "Clash 代理已运行，跳过启动"
fi

# 2. 启动 MongoDB（如果未运行）
if ! pgrep -x "mongod" > /dev/null; then
    log "启动 MongoDB..."
    mkdir -p "$MONGO_DB_PATH" "$LOG_DIR"
    chown -R "$(id -u):$(id -g)" "$MONGO_DB_PATH" "$LOG_DIR" 2>/dev/null || true
    MONGO_PID="$(start_detached "$ES_ROOT" "$MONGO_LOG" mongod --logpath "$MONGO_LOG" --dbpath "$MONGO_DB_PATH" --bind_ip 127.0.0.1)"
    log "MongoDB 已启动 (PID: $MONGO_PID)"
else
    log "MongoDB 已运行，跳过启动"
fi

# 3. 启动 Redis（如果未运行）
if ! pgrep -x "redis-server" > /dev/null; then
    log "启动 Redis..."
    redis-server --daemonize yes &
else
    log "Redis 已运行，跳过启动"
fi

# 4. 启动 Meilisearch（如果未运行）
if ! check_port "127.0.0.1" "7700"; then
    log "启动 Meilisearch..."
    if [ -n "$MEILISEARCH_BIN" ] && [ -x "$MEILISEARCH_BIN" ]; then
        MEILI_PID="$(start_detached "$ES_ROOT" "$LOG_DIR/meilisearch.log" "$MEILISEARCH_BIN" --master-key masterKey --http-addr 127.0.0.1:7700 --db-path "$MEILISEARCH_DATA_PATH")"
        log "Meilisearch 已启动 (PID: $MEILI_PID)"
    else
        log "⚠️  meilisearch 未安装或不可执行，跳过启动"
    fi
else
    log "Meilisearch 已运行，跳过启动"
fi

# 5. 启动前端（先停止旧实例）
if pgrep -f "vite.*3001" > /dev/null || pgrep -f "node.*frontend" > /dev/null; then
    log "检测到前端已运行，先停止..."
    pkill -f "vite.*3001" || true
    pkill -f "node.*frontend" || true
    sleep 2
fi
log "启动前端..."
FRONTEND_PID="$(start_detached "${ES_ROOT}/frontend" "$LOG_DIR/frontend.log" npm run dev -- --host 0.0.0.0 --port 3001)"
log "前端已启动 (PID: $FRONTEND_PID)"

# 等待第一批服务启动
log "等待第一批服务启动（15秒）..."
sleep 15

# ============================================================
# 第一批：健康检查
# ============================================================
log "========== 第一批：健康检查 =========="

# 检查 Clash
CLASH_READY=false
if check_port "$PROXY_HOST" "$PROXY_PORT"; then
    log "Clash 代理端口监听正常: ${PROXY_HOST}:${PROXY_PORT}"
    if wait_for_http "http://127.0.0.1:9090" "Clash API"; then
        CLASH_READY=true
    else
        log "⚠️  Clash API 未就绪（可忽略）"
        CLASH_READY=true  # 端口监听即可
    fi
else
    log "❌ Clash 代理启动失败，端口未监听"
    exit 1
fi

# 检查 MongoDB
MONGODB_READY=false
if pgrep -x "mongod" > /dev/null; then
    if check_port "127.0.0.1" "27017"; then
        log "MongoDB 端口监听正常: 27017"
        MONGODB_READY=true
    else
        log "❌ MongoDB 端口未监听: 27017"
        exit 1
    fi
else
    log "❌ MongoDB 进程未运行"
    exit 1
fi

# 检查 Redis
REDIS_READY=false
if pgrep -x "redis-server" > /dev/null; then
    if check_port "127.0.0.1" "6379"; then
        log "Redis 端口监听正常: 6379"
        REDIS_READY=true
    else
        log "❌ Redis 端口未监听: 6379"
        exit 1
    fi
else
    log "❌ Redis 进程未运行"
    exit 1
fi

# 检查 Meilisearch
MEILISEARCH_READY=false
if check_port "127.0.0.1" "7700"; then
    if wait_for_http "http://127.0.0.1:7700/health" "Meilisearch"; then
        MEILISEARCH_READY=true
    else
        log "❌ Meilisearch 健康检查失败"
        exit 1
    fi
else
    log "❌ Meilisearch 端口未监听: 7700"
    exit 1
fi

# 检查前端（失败仅警告）
if ! wait_for_http "http://127.0.0.1:3001" "Frontend"; then
    log "⚠️  前端健康检查失败，但继续后续流程"
fi

log "========== 第一批服务启动完成 =========="

# ============================================================
# 第二批：条件并行启动应用服务
# ============================================================
log "========== 第二批：条件并行启动应用服务 =========="

STOCK_MCP_STARTED=false
STOCK_MCP_READY=false
LIBRECHAT_STARTED=false

# 循环检查条件，满足则启动
max_wait=60
waited=0
while [ $waited -lt $max_wait ]; do
    # 检查 stock-mcp 启动条件
    if [ "$STOCK_MCP_STARTED" = false ] && [ "$CLASH_READY" = true ] && [ "$REDIS_READY" = true ]; then
        log "stock-mcp 启动条件满足 (Clash + Redis)，开始启动..."

        # 停止旧实例
        if pgrep -f "uvicorn.*9898" > /dev/null; then
            log "检测到 stock-mcp 已运行，先停止..."
            pkill -f "uvicorn.*9898" || true
            pkill -f "start_stock_mcp_http.sh" || true
            sleep 2
        fi

        cd "${ES_ROOT}/stock-mcp"
        export MCP_TRANSPORT=streamable-http
        export PYTHONPATH="${ES_ROOT}/stock-mcp"
        log "使用Python: ${STOCK_MCP_PYTHON}"
        if [ -x "$STOCK_MCP_PYTHON" ]; then
            mkdir -p "${ES_ROOT}/librechat_user_data"
            STOCK_PID="$(start_detached "${ES_ROOT}/stock-mcp" "$LOG_DIR/stock-mcp.log" env LIBRECHAT_USER_DATA_DIR="${ES_ROOT}/librechat_user_data" MCP_TRANSPORT=streamable-http PYTHONPATH="${ES_ROOT}/stock-mcp" "$STOCK_MCP_PYTHON" -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898)"
            log "stock-mcp 已启动 (PID: $STOCK_PID)"
            STOCK_MCP_STARTED=true
            if wait_for_http "http://127.0.0.1:9898/health" "stock-mcp"; then
                STOCK_MCP_READY=true
            else
                log "⚠️  stock-mcp 尚未健康，LibreChat 暂不启动，避免 MCP 0 tools"
            fi
        else
            log "❌ stock-mcp Python 不存在或不可执行: $STOCK_MCP_PYTHON，请先运行 ${ES_ROOT}/deploy/setup.sh"
        fi
    fi

    # 检查 LibreChat 启动条件
    if [ "$LIBRECHAT_STARTED" = false ] && [ "$MONGODB_READY" = true ] && [ "$REDIS_READY" = true ] && [ "$MEILISEARCH_READY" = true ] && [ "$STOCK_MCP_READY" = true ]; then
        log "LibreChat 启动条件满足 (MongoDB + Redis + Meilisearch + stock-mcp)，开始启动..."

        # 停止旧实例
        if pgrep -f "LibreChat.*3080" > /dev/null || pgrep -f "node.*LibreChat" > /dev/null; then
            log "检测到 LibreChat 已运行，先停止..."
            pkill -f "LibreChat.*3080" || true
            pkill -f "node.*LibreChat" || true
            sleep 2
        fi

        cd "${ES_ROOT}/LibreChat"
        mkdir -p "${ES_ROOT}/librechat_user_data"
        LIBRECHAT_PID="$(start_detached "${ES_ROOT}/LibreChat" "$LOG_DIR/librechat.log" env CONFIG_PATH="${LIBRECHAT_CONFIG}" LIBRECHAT_USER_DATA_DIR="${ES_ROOT}/librechat_user_data" NODE_ENV=production node api/server/index.js)"
        log "LibreChat 已启动 (PID: $LIBRECHAT_PID)"
        LIBRECHAT_STARTED=true
    fi

    # 两个都已启动，退出循环
    if [ "$STOCK_MCP_READY" = true ] && [ "$LIBRECHAT_STARTED" = true ]; then
        log "第二批服务已全部启动，退出等待循环"
        break
    fi

    sleep 2
    waited=$((waited + 2))
done

# 等待第二批服务完全启动
log "等待第二批服务完全启动（60秒）..."
sleep 60

# ============================================================
# 第二批：健康检查（失败仅警告）
# ============================================================
log "========== 第二批：健康检查 =========="

# 检查 stock-mcp
if [ "$STOCK_MCP_STARTED" = true ]; then
    if ! wait_for_http "http://127.0.0.1:9898/health" "stock-mcp"; then
        log "⚠️  stock-mcp 健康检查失败，但继续后续流程"
        log "进程状态: $(ps aux | grep 'uvicorn.*9898' | grep -v grep || echo '进程不存在')"
        log "端口状态: $(netstat -tlnp 2>/dev/null | grep 9898 || echo '端口未监听')"
    fi
else
    log "⚠️  stock-mcp 未启动（条件未满足）"
fi

# 检查 LibreChat
if [ "$LIBRECHAT_STARTED" = true ]; then
    if ! wait_for_http "http://127.0.0.1:3080/health" "LibreChat"; then
        if ! wait_for_http "http://[::1]:3080/health" "LibreChat"; then
            log "⚠️  LibreChat 健康检查失败，但继续后续流程"
            log "进程状态: $(ps aux | grep 'node.*LibreChat' | grep -v grep || echo '进程不存在')"
            log "端口状态: $(netstat -tlnp 2>/dev/null | grep 3080 || echo '端口未监听')"
        fi
    fi
else
    log "⚠️  LibreChat 未启动（条件未满足）"
fi

# ============================================================
# 启动完成
# ============================================================
log "===== 所有服务启动流程完成 ====="
log "主入口: http://服务器IP:3001"
log "LibreChat(内部): http://127.0.0.1:3080"
log "stock-mcp(内部): http://127.0.0.1:9898"
log "日志目录: $LOG_DIR"

exit 0

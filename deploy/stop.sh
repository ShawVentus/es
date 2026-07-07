#!/usr/bin/env bash
# ============================================================
# stop.sh - 一键停止脚本
# 用途：停止前端、LibreChat、stock-mcp、Meilisearch、Redis、MongoDB、Clash代理
# 日志：${ES_ROOT}/deploy/logs/
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_ROOT="${ES_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-${ES_ROOT}/deploy/logs}"
mkdir -p "$LOG_DIR"
STOP_LOG="$LOG_DIR/stop.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STOP_LOG"
}

stop_process() {
    local pattern="$1"
    local name="$2"

    if pgrep -af "$pattern" >/dev/null 2>&1; then
        log "停止 ${name}..."
        pkill -f "$pattern" || true
        sleep 1
    fi

    if pgrep -af "$pattern" >/dev/null 2>&1; then
        log "${name} 未完全停止"
        return 1
    fi

    log "${name} 已停止"
    return 0
}

stop_named() {
    local name="$1"

    if pgrep -x "$name" >/dev/null 2>&1; then
        log "停止 ${name}..."
        pkill -x "$name" || true
        sleep 1
    fi

    if pgrep -x "$name" >/dev/null 2>&1; then
        log "${name} 未完全停止"
        return 1
    fi

    log "${name} 已停止"
    return 0
}

stop_port() {
    local port="$1"
    local name="$2"
    local pids=""

    if command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
    fi

    if [ -z "$pids" ]; then
        log "${name} 端口 ${port} 未监听"
        return 0
    fi

    log "停止 ${name}（端口 ${port}: ${pids})..."
    kill $pids 2>/dev/null || true
    sleep 1

    if command -v lsof >/dev/null 2>&1 && lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        log "${name} 未完全停止，使用 kill -9"
        kill -9 $pids 2>/dev/null || true
        sleep 1
    fi

    log "${name} 已停止"
    return 0
}

stop_process "vite" "前端 (V2)"
stop_process "api/server/index.js" "LibreChat"
stop_port "3080" "LibreChat"
stop_process "uvicorn src.server.app:app" "stock-mcp"
stop_port "9898" "stock-mcp"
stop_port "3001" "nginx"
stop_port "7700" "Meilisearch"
stop_port "6379" "Redis"
stop_port "27017" "MongoDB"

# 停止 Clash 代理
CLASH_PATTERN="${CLASH_PATTERN:-${ES_ROOT}/clash/clash}"
if pgrep -f "$CLASH_PATTERN" >/dev/null 2>&1; then
    log "停止 Clash 代理..."
    pkill -f "$CLASH_PATTERN" 2>/dev/null || true
    sleep 1
    if pgrep -f "$CLASH_PATTERN" >/dev/null 2>&1; then
        log "Clash 代理未完全停止，使用 kill -9"
        pkill -9 -f "$CLASH_PATTERN" 2>/dev/null || true
    fi
    log "Clash 代理已停止"
else
    log "Clash 代理未运行"
fi

log "===== 停止完成 ====="
log "日志目录: $LOG_DIR"

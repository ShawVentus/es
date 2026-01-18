#!/usr/bin/env bash
# ============================================================
# stop.sh - 一键停止脚本
# 用途：停止前端、LibreChat、stock-mcp、Meilisearch、Redis、MongoDB、Clash代理
# 日志：/root/deploy/logs/
# ============================================================

LOG_DIR="/root/deploy/logs"
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

stop_process "vite" "前端 (V2)"
stop_process "api/server/index.js" "LibreChat"
stop_process "uvicorn src.server.app:app" "stock-mcp"
stop_named "meilisearch"
stop_named "redis-server"
stop_named "mongod"

# 停止 Clash 代理
if pgrep -f "/root/clash/clash" >/dev/null 2>&1; then
    log "停止 Clash 代理..."
    pkill -f "/root/clash/clash" 2>/dev/null || true
    sleep 1
    if pgrep -f "/root/clash/clash" >/dev/null 2>&1; then
        log "Clash 代理未完全停止，使用 kill -9"
        pkill -9 -f "/root/clash/clash" 2>/dev/null || true
    fi
    log "Clash 代理已停止"
else
    log "Clash 代理未运行"
fi

log "===== 停止完成 ====="
log "日志目录: $LOG_DIR"

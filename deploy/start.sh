#!/usr/bin/env bash
# ============================================================
# start.sh - 一键启动脚本（nginx统一端口版）
# 第一批：Clash、MongoDB、Redis、Meilisearch、前端
# 第二批：stock-mcp、LibreChat
# 第三批：nginx反向代理（统一3001端口）
# 日志：/root/deploy/logs/
# ============================================================

# 全局超时10分钟（600秒）
GLOBAL_TIMEOUT=600
SCRIPT_START_TIME=$(date +%s)

LOG_DIR="/root/deploy/logs"
mkdir -p "$LOG_DIR"
STARTUP_LOG="$LOG_DIR/startup.log"
REDIS_LOG="$LOG_DIR/redis.log"
MONGO_LOG="/var/log/mongodb/mongod.log"
PROXY_LOG="$LOG_DIR/proxy.log"
MEILISEARCH_LOG="$LOG_DIR/meilisearch.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
STOCKMCP_LOG="$LOG_DIR/stock-mcp.log"
LIBRECHAT_LOG="$LOG_DIR/librechat.log"
NGINX_LOG="$LOG_DIR/nginx.log"
STATUS_DIR="$LOG_DIR/status"
mkdir -p "$STATUS_DIR"

PROXY_HOST="127.0.0.1"
PROXY_PORT="7897"

# 服务状态通过文件共享（支持后台进程修改）
set_service_status() {
    local service="$1"
    local status="$2"
    echo "$status" > "$STATUS_DIR/${service}.status"
}

get_service_status() {
    local service="$1"
    if [ -f "$STATUS_DIR/${service}.status" ]; then
        cat "$STATUS_DIR/${service}.status"
    else
        echo "⏳ 未知"
    fi
}

# 初始化状态
set_service_status "Clash" "⏳ 启动中"
set_service_status "MongoDB" "⏳ 启动中"
set_service_status "Redis" "⏳ 启动中"
set_service_status "Meilisearch" "⏳ 启动中"
set_service_status "Frontend" "⏳ 启动中"
set_service_status "stock-mcp" "⏳ 未启动"
set_service_status "LibreChat" "⏳ 未启动"
set_service_status "Nginx" "⏳ 未启动"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STARTUP_LOG"
}

check_global_timeout() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - SCRIPT_START_TIME))
    if [ $elapsed -ge $GLOBAL_TIMEOUT ]; then
        log "❌ 全局超时（${GLOBAL_TIMEOUT}秒），脚本终止"
        print_service_summary
        exit 1
    fi
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

wait_for_http() {
    local url="$1"
    local name="$2"
    local timeout_seconds="${3:-100}"
    local interval="${4:-5}"
    local max_attempts=$((timeout_seconds / interval))
    local attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
            log "$name 健康检查通过"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep "$interval"
    done

    log "$name 健康检查失败: $url (超时${timeout_seconds}秒)"
    return 1
}

# 后台日志监听函数
monitor_log_for_keyword() {
    local log_file="$1"
    local keyword="$2"
    local service_name="$3"
    local timeout=60
    local start_time=$(date +%s)

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -ge $timeout ]; then
            log "⚠️  ${service_name} 日志监听超时（${timeout}秒），未检测到关键字: ${keyword}"
            set_service_status "$service_name" "⚠️  日志监听超时"
            return 1
        fi

        if [ -f "$log_file" ]; then
            if tail -n 100 "$log_file" 2>/dev/null | grep -q "$keyword"; then
                log "✅ ${service_name} 启动成功（检测到: ${keyword}）"
                set_service_status "$service_name" "✅ 运行中"
                return 0
            fi
        fi

        sleep 2
    done
}

# 第二梯队健康检查函数（简化版：只检查不重启）
check_service_health() {
    local service_name="$1"
    local health_url="$2"
    local pid="$3"
    local log_file="$4"
    local start_cmd="$5"

    log "后台检查 ${service_name} 健康状态（不阻塞nginx启动）..."

    # 只检查5次，每次10秒，共50秒
    local attempt
    for attempt in 1 2 3 4 5; do
        sleep 10
        if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
            log "✅ ${service_name} 健康检查通过"
            set_service_status "$service_name" "✅ 运行中"
            return 0
        fi
        log "${service_name} 第${attempt}次检查未通过，继续等待..."
    done

    # 5次检查失败，标记但不重启
    log "⚠️  ${service_name} 健康检查未通过，但继续运行（可能需要更长启动时间）"
    set_service_status "$service_name" "⚠️  启动中"
    return 1
}

# 检查第一梯队是否全部通过
check_tier1_all_ready() {
    local services=("Clash" "MongoDB" "Redis" "Meilisearch" "Frontend")
    for svc in "${services[@]}"; do
        local status="$(get_service_status "$svc")"
        # Frontend特殊处理：构建完成即可
        if [[ "$svc" == "Frontend" && "$status" == "✅ 构建完成" ]]; then
            continue
        fi
        if [[ "$status" != "✅ 运行中" && "$status" != "✅ 已运行" ]]; then
            return 1
        fi
    done
    return 0
}

# 打印最终服务状态摘要
print_service_summary() {
    log ""
    log "=========================================="
    log "        服务状态摘要"
    log "=========================================="
    log "第一梯队（基础服务）："
    log "  Clash:        $(get_service_status 'Clash')"
    log "  MongoDB:      $(get_service_status 'MongoDB')"
    log "  Redis:        $(get_service_status 'Redis')"
    log "  Meilisearch:  $(get_service_status 'Meilisearch')"
    log "  Frontend:     $(get_service_status 'Frontend')"
    log ""
    log "第二梯队（应用服务）："
    log "  stock-mcp:    $(get_service_status 'stock-mcp')"
    log "  LibreChat:    $(get_service_status 'LibreChat')"
    log ""
    log "第三梯队（反向代理）："
    log "  Nginx:        $(get_service_status 'Nginx')"
    log "=========================================="
    log "【对外访问】"
    log "  主入口(nginx): http://服务器IP:3001"
    log "  API接口:       http://服务器IP:3001/api/"
    log ""
    log "【内部服务】"
    log "  stock-mcp:     http://127.0.0.1:9898"
    log "  LibreChat:     http://127.0.0.1:3080"
    log "  静态文件目录:  /root/frontend/dist"
    log ""
    log "日志目录: $LOG_DIR"
    log "=========================================="
}

# ============================================================
# 优先启动nginx（立即响应K8s健康检查）
# ============================================================
log "========== 优先启动：nginx反向代理（快速响应健康检查）=========="

# 检查前端构建产物
log "检查前端构建产物..."
cd /root/frontend
if [ ! -d "dist" ]; then
    log "构建前端静态文件..."
    npm run build >> "$FRONTEND_LOG" 2>&1
    if [ $? -eq 0 ]; then
        log "✅ 前端构建成功"
        set_service_status "Frontend" "✅ 构建完成"
    else
        log "❌ 前端构建失败"
        set_service_status "Frontend" "❌ 构建失败"
    fi
else
    log "✅ 前端构建产物已存在，跳过构建"
    set_service_status "Frontend" "✅ 构建完成"
fi

# 检查nginx是否安装
if ! command -v nginx >/dev/null 2>&1; then
    log "⚠️  nginx未安装，尝试快速安装..."
    if apt-get update -qq 2>/dev/null && apt-get install -y --no-install-recommends nginx >> "$NGINX_LOG" 2>&1; then
        log "✅ nginx安装成功"
    else
        log "❌ nginx安装失败"
        set_service_status "Nginx" "❌ 安装失败"
        exit 1
    fi
fi

# 停止旧nginx
if pgrep nginx > /dev/null; then
    log "停止旧nginx进程..."
    nginx -s stop 2>/dev/null || pkill -9 nginx
    sleep 2
fi

# 测试nginx配置
log "测试nginx配置..."
if ! nginx -t -c /root/deploy/nginx.conf >> "$NGINX_LOG" 2>&1; then
    log "❌ nginx配置测试失败"
    cat "$NGINX_LOG" | tail -20 | tee -a "$STARTUP_LOG"
    set_service_status "Nginx" "❌ 配置错误"
    exit 1
fi
log "✅ nginx配置测试通过"

# 启动nginx
log "启动nginx..."
if ! nginx -c /root/deploy/nginx.conf >> "$NGINX_LOG" 2>&1; then
    log "❌ nginx启动失败"
    cat "$NGINX_LOG" | tail -20 | tee -a "$STARTUP_LOG"
    set_service_status "Nginx" "❌ 启动失败"
    exit 1
fi

# 等待nginx启动并检查端口
log "等待nginx启动..."
for i in {1..10}; do
    if netstat -lnt 2>/dev/null | grep -q ":3001 " || ss -lnt 2>/dev/null | grep -q ":3001 "; then
        log "✅ nginx启动成功，监听3001端口（K8s健康检查可通过）"
        set_service_status "Nginx" "✅ 运行中"
        break
    fi
    if [ $i -eq 10 ]; then
        log "❌ nginx端口3001未监听（超时10秒）"
        cat "$NGINX_LOG" | tail -20 | tee -a "$STARTUP_LOG"
        set_service_status "Nginx" "❌ 端口未监听"
        exit 1
    fi
    sleep 1
done

# ============================================================
# 第一批：后台启动基础服务（不阻塞）
# ============================================================
log "========== 第一批：后台启动基础服务 =========="

# 1. 启动 Clash
if ! check_port "$PROXY_HOST" "$PROXY_PORT"; then
    log "启动 Clash 代理..."
    /root/clash/scripts/proxy.sh start >/dev/null 2>&1 &
else
    log "Clash 代理已运行，跳过启动"
    set_service_status "Clash" "✅ 已运行"
fi

# 2. 启动 MongoDB
if ! pgrep -x "mongod" > /dev/null; then
    log "启动 MongoDB..."
    mkdir -p /data/db /var/log/mongodb
    chown -R root:root /data/db /var/log/mongodb 2>/dev/null || true
    # 清理锁文件防止启动失败
    rm -f /data/db/mongod.lock
    rm -f /data/db/WiredTiger.lock
    mongod --fork --logpath "$MONGO_LOG" --dbpath /data/db --bind_ip 127.0.0.1 >/dev/null 2>&1 &
else
    log "MongoDB 已运行，跳过启动"
    set_service_status "MongoDB" "✅ 已运行"
fi

# 3. 启动 Redis（添加日志路径）
if ! pgrep -x "redis-server" > /dev/null; then
    log "启动 Redis..."
    redis-server --daemonize yes --logfile "$REDIS_LOG" &
else
    log "Redis 已运行，跳过启动"
    set_service_status "Redis" "✅ 已运行"
fi

# 4. 启动 Meilisearch（添加绝对路径db-path）
if ! check_port "127.0.0.1" "7700"; then
    log "启动 Meilisearch..."
    nohup /root/meilisearch --master-key masterKey --http-addr 0.0.0.0:7700 --db-path /root/deploy/data.ms > "$MEILISEARCH_LOG" 2>&1 &
else
    log "Meilisearch 已运行，跳过启动"
    set_service_status "Meilisearch" "✅ 已运行"
fi

# ============================================================
# 后台日志监听基础服务（不阻塞主流程）
# ============================================================
log "========== 第一批：后台日志监听（60秒超时）=========="

# 如果服务未标记为"已运行"，则启动监听
# Clash 特殊处理：直接检查端口而非日志
if [ "$(get_service_status 'Clash')" != "✅ 已运行" ]; then
    {
        for i in {1..12}; do  # 60秒 = 12次 × 5秒
            if check_port "127.0.0.1" "7897"; then
                log "✅ Clash 启动成功（端口7897监听）"
                set_service_status "Clash" "✅ 运行中"
                exit 0
            fi
            sleep 5
        done
        log "⚠️  Clash 端口监听超时（60秒）"
        set_service_status "Clash" "⚠️  端口监听超时"
    } &
fi

[ "$(get_service_status 'MongoDB')" != "✅ 已运行" ] && monitor_log_for_keyword "$MONGO_LOG" "Waiting for connections" "MongoDB" &
[ "$(get_service_status 'Redis')" != "✅ 已运行" ] && monitor_log_for_keyword "$REDIS_LOG" "Ready to accept connections" "Redis" &
[ "$(get_service_status 'Meilisearch')" != "✅ 已运行" ] && monitor_log_for_keyword "$MEILISEARCH_LOG" "Thank you for using Meilisearch!" "Meilisearch" &
# Frontend 不需要日志监听（只是构建，不是运行服务）

# ============================================================
# 动态等待第二批启动（最快立即启动，最慢120秒）
# ============================================================
log "========== 等待第一梯队全部就绪（最长120秒）=========="
TIER1_WAIT_START=$(date +%s)
TIER1_MAX_WAIT=120

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - TIER1_WAIT_START))

    # 检查是否超过120秒
    if [ $elapsed -ge $TIER1_MAX_WAIT ]; then
        log "⏱️  已等待${TIER1_MAX_WAIT}秒，第一梯队未全部就绪，启动第二梯队"
        break
    fi

    # 检查第一梯队是否全部就绪
    if check_tier1_all_ready; then
        log "✅ 第一梯队全部就绪（耗时${elapsed}秒），立即启动第二梯队"
        break
    fi

    sleep 5
done

check_global_timeout

# ============================================================
# 第二批：无条件启动 stock-mcp 和 LibreChat
# ============================================================
log "========== 第二批：启动应用服务 =========="

# 停止旧 stock-mcp 实例
if pgrep -f "uvicorn.*9898" > /dev/null; then
    log "检测到 stock-mcp 已运行，先停止..."
    pkill -f "uvicorn.*9898" || true
    sleep 2
fi

# 启动 stock-mcp
log "启动 stock-mcp..."
cd /root/stock-mcp
export MCP_TRANSPORT=streamable-http
export PYTHONPATH=/root/stock-mcp
STOCKMCP_START_CMD="cd /root/stock-mcp && MCP_TRANSPORT=streamable-http PYTHONPATH=/root/stock-mcp nohup /opt/mamba/envs/stock-mcp/bin/python -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898 >> $STOCKMCP_LOG 2>&1"
nohup /opt/mamba/envs/stock-mcp/bin/python -m uvicorn src.server.app:app --host 0.0.0.0 --port 9898 >> "$STOCKMCP_LOG" 2>&1 &
STOCK_PID=$!
log "stock-mcp 已启动 (PID: $STOCK_PID)"
set_service_status "stock-mcp" "⏳ 启动中"

# 停止旧 LibreChat 实例
if pgrep -f "LibreChat.*3080" > /dev/null || pgrep -f "node.*LibreChat" > /dev/null; then
    log "检测到 LibreChat 已运行，先停止..."
    pkill -f "LibreChat.*3080" || true
    pkill -f "node.*LibreChat" || true
    sleep 2
fi

# 启动 LibreChat
log "启动 LibreChat..."
cd /root/LibreChat
LIBRECHAT_START_CMD="cd /root/LibreChat && nohup npm run backend >> $LIBRECHAT_LOG 2>&1"
nohup npm run backend >> "$LIBRECHAT_LOG" 2>&1 &
LIBRECHAT_PID=$!
log "LibreChat 已启动 (PID: $LIBRECHAT_PID)"
set_service_status "LibreChat" "⏳ 启动中"

# ============================================================
# 后台健康检查（不阻塞，不重启）
# ============================================================
log "========== 后台检查应用服务健康状态 =========="

check_service_health "stock-mcp" "http://127.0.0.1:9898/health" "$STOCK_PID" "$STOCKMCP_LOG" "$STOCKMCP_START_CMD" &
check_service_health "LibreChat" "http://127.0.0.1:3080/health" "$LIBRECHAT_PID" "$LIBRECHAT_LOG" "$LIBRECHAT_START_CMD" &

log "后台健康检查已启动，不阻塞主流程"

# ============================================================
# 启动完成
# ============================================================
log "========== 所有服务启动流程完成 =========="
print_service_summary

exit 0

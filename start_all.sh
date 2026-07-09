#!/usr/bin/env bash
# ============================================================
# start_all.sh - ES/LibreChat/stock-mcp 完整服务统一入口
#
# 默认动作：启动完整服务栈，并做基础验证。
# 实际服务编排复用 deploy/start.sh，避免维护两套启动逻辑。
#
# 常用命令：
#   ./start_all.sh                 # 启动完整服务栈
#   ./start_all.sh --setup         # 先执行 deploy/setup.sh 再启动
#   ./start_all.sh restart         # 停止后重新启动
#   ./start_all.sh status          # 查看端口/健康状态
#   ./start_all.sh verify          # 执行静态部署验证 + 运行时健康检查
#   ./start_all.sh logs stock-mcp  # 查看指定服务日志
#   ./start_all.sh stop            # 停止服务
# ============================================================

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_ROOT="${ES_ROOT:-$SCRIPT_DIR}"
DEPLOY_DIR="$ES_ROOT/deploy"
LOG_DIR="${LOG_DIR:-$DEPLOY_DIR/logs}"

START_SCRIPT="$DEPLOY_DIR/start.sh"
STOP_SCRIPT="$DEPLOY_DIR/stop.sh"
SETUP_SCRIPT="$DEPLOY_DIR/setup.sh"
VERIFY_SCRIPT="$DEPLOY_DIR/verify.sh"

ACTION="start"
RUN_SETUP=false
RUN_VERIFY=true
TAIL_AFTER_START=false
LOG_TARGET="startup"

usage() {
  cat <<EOF
用法：
  ./start_all.sh [动作] [选项]

动作：
  start                 启动完整服务栈（默认）
  stop                  停止完整服务栈
  restart               stop 后再 start
  status                查看核心服务状态
  verify                执行部署验证和运行时健康检查
  logs [服务名]          tail 指定日志；服务名见下方
  help                  显示帮助

选项：
  --setup               启动前先执行 deploy/setup.sh 安装/准备依赖
  --no-verify           start 后不执行验证
  --tail                start 后持续跟随 startup.log
  -h, --help            显示帮助

日志服务名：
  startup, nginx, stock-mcp, librechat, frontend, mongo, redis, meili, proxy

访问地址：
  主入口：      http://127.0.0.1:3001
  LibreChat：   http://127.0.0.1:3001/librechat/
  stock-mcp：   http://127.0.0.1:9898/health
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  log "⚠️  $*" >&2
}

die() {
  log "❌ $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [ -f "$path" ] || die "缺少文件：$path"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_port() {
  local host="$1"
  local port="$2"

  if have_cmd nc; then
    nc -z -w 2 "$host" "$port" >/dev/null 2>&1
    return $?
  fi

  if have_cmd lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  bash -c "cat < /dev/tcp/${host}/${port}" >/dev/null 2>&1
}

http_ok() {
  local url="$1"
  curl -fsS --max-time 3 "$url" >/dev/null 2>&1
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-60}"
  local interval="${4:-3}"
  local start_time elapsed

  start_time="$(date +%s)"
  while true; do
    if http_ok "$url"; then
      log "✅ $name 健康检查通过：$url"
      return 0
    fi

    elapsed=$(($(date +%s) - start_time))
    if [ "$elapsed" -ge "$timeout_seconds" ]; then
      warn "$name 健康检查超时：$url"
      return 1
    fi

    sleep "$interval"
  done
}

log_file_for() {
  case "$1" in
    startup)   printf '%s\n' "$LOG_DIR/startup.log" ;;
    nginx)     printf '%s\n' "$LOG_DIR/nginx.log" ;;
    stock-mcp) printf '%s\n' "$LOG_DIR/stock-mcp.log" ;;
    librechat) printf '%s\n' "$LOG_DIR/librechat.log" ;;
    frontend)  printf '%s\n' "$LOG_DIR/frontend.log" ;;
    mongo)     printf '%s\n' "$LOG_DIR/mongod.log" ;;
    redis)     printf '%s\n' "$LOG_DIR/redis.log" ;;
    meili|meilisearch) printf '%s\n' "$LOG_DIR/meilisearch.log" ;;
    proxy)     printf '%s\n' "$LOG_DIR/proxy.log" ;;
    *) die "未知日志服务名：$1。可选：startup, nginx, stock-mcp, librechat, frontend, mongo, redis, meili, proxy" ;;
  esac
}

preflight() {
  log "执行启动前检查..."

  require_file "$START_SCRIPT"
  require_file "$STOP_SCRIPT"
  require_file "$VERIFY_SCRIPT"

  have_cmd bash || die "缺少 bash"
  have_cmd curl || die "缺少 curl"
  have_cmd node || die "缺少 node"
  have_cmd npm || die "缺少 npm"

  if ! have_cmd nginx; then
    warn "未检测到 nginx；deploy/start.sh 会尝试启动/安装，但本机环境建议提前安装。"
  fi
  if ! have_cmd mongod; then
    warn "未检测到 mongod；LibreChat 需要 MongoDB。必要时先运行：./start_all.sh --setup"
  fi
  if ! have_cmd redis-server; then
    warn "未检测到 redis-server；LibreChat 需要 Redis。必要时先运行：./start_all.sh --setup"
  fi
  if ! have_cmd meilisearch; then
    warn "未检测到 meilisearch；搜索功能可能不可用。必要时先运行：./start_all.sh --setup"
  fi

  [ -f "$ES_ROOT/frontend/.env" ] || warn "缺少 frontend/.env；请确认 VITE_AGENT_URL=/librechat/"
  [ -f "$ES_ROOT/LibreChat/.env" ] || warn "缺少 LibreChat/.env；LibreChat 启动可能失败"
  [ -f "$ES_ROOT/LibreChat/config/librechat.stock-mcp.yaml" ] || die "缺少 LibreChat stock-mcp 配置：LibreChat/config/librechat.stock-mcp.yaml"

  if [ ! -x "$ES_ROOT/stock-mcp/.venv/bin/python" ]; then
    if [ "$RUN_SETUP" = true ]; then
      warn "缺少 stock-mcp Python 虚拟环境；将先运行 deploy/setup.sh 准备环境。"
    else
      die "缺少 stock-mcp Python 虚拟环境：stock-mcp/.venv/bin/python。请先运行：./start_all.sh --setup"
    fi
  fi

  if [ ! -d "$ES_ROOT/LibreChat/node_modules" ]; then
    warn "LibreChat/node_modules 不存在；如启动失败请先运行 ./start_all.sh --setup 或在 LibreChat 中安装依赖。"
  fi
  if [ ! -d "$ES_ROOT/frontend/node_modules" ]; then
    warn "frontend/node_modules 不存在；如构建失败请先运行 ./start_all.sh --setup 或在 frontend 中安装依赖。"
  fi

  mkdir -p "$LOG_DIR" "$ES_ROOT/librechat_user_data"
  log "启动前检查完成。"
}

runtime_smoke() {
  local failed=false

  log "执行运行时健康检查..."
  wait_for_http "http://127.0.0.1:3001/health" "Nginx 主入口" 30 2 || failed=true
  wait_for_http "http://127.0.0.1:9898/health" "stock-mcp" 60 3 || failed=true
  wait_for_http "http://127.0.0.1:3080/health" "LibreChat" 60 3 || failed=true

  if [ "$failed" = true ]; then
    warn "运行时健康检查存在失败项，请查看：$LOG_DIR/startup.log"
    return 1
  fi

  log "✅ 运行时健康检查通过。"
}

static_verify() {
  log "执行部署静态验证：deploy/verify.sh"
  bash "$VERIFY_SCRIPT"
}

print_status_line() {
  local name="$1"
  local port="$2"
  local url="${3:-}"
  local state="❌ 未监听"

  if check_port "127.0.0.1" "$port"; then
    state="✅ 端口监听"
    if [ -n "$url" ]; then
      if http_ok "$url"; then
        state="✅ 健康"
      else
        state="⚠️  端口监听但健康检查失败"
      fi
    fi
  fi

  printf '  %-12s %-6s %s\n' "$name" "$port" "$state"
}

show_status() {
  log "核心服务状态："
  print_status_line "Nginx" "3001" "http://127.0.0.1:3001/health"
  print_status_line "LibreChat" "3080" "http://127.0.0.1:3080/health"
  print_status_line "stock-mcp" "9898" "http://127.0.0.1:9898/health"
  print_status_line "MongoDB" "27017"
  print_status_line "Redis" "6379"
  print_status_line "Meilisearch" "7700"
  log "日志目录：$LOG_DIR"
}

start_all() {
  preflight

  if [ "$RUN_SETUP" = true ]; then
    require_file "$SETUP_SCRIPT"
    log "执行环境准备：deploy/setup.sh"
    bash "$SETUP_SCRIPT"
  fi

  log "启动完整服务栈：deploy/start.sh"
  bash "$START_SCRIPT"

  if [ "$RUN_VERIFY" = true ]; then
    static_verify
    runtime_smoke
  fi

  show_status
  log "启动完成。主入口：http://127.0.0.1:3001"
  log "LibreChat：http://127.0.0.1:3001/librechat/"

  if [ "$TAIL_AFTER_START" = true ]; then
    tail_logs "startup"
  fi
}

stop_all() {
  require_file "$STOP_SCRIPT"
  log "停止完整服务栈：deploy/stop.sh"
  bash "$STOP_SCRIPT"
}

verify_all() {
  static_verify
  runtime_smoke
  show_status
}

tail_logs() {
  local target="${1:-startup}"
  local file
  file="$(log_file_for "$target")"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  log "跟随日志：$file"
  tail -n 120 -f "$file"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      start|stop|restart|status|verify|logs|help)
        ACTION="$1"
        ;;
      --setup)
        RUN_SETUP=true
        ;;
      --no-verify)
        RUN_VERIFY=false
        ;;
      --tail)
        TAIL_AFTER_START=true
        ;;
      -h|--help)
        ACTION="help"
        ;;
      *)
        if [ "$ACTION" = "logs" ]; then
          LOG_TARGET="$1"
        else
          die "未知参数：$1。使用 ./start_all.sh help 查看帮助。"
        fi
        ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"

  case "$ACTION" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      sleep 2
      start_all
      ;;
    status)
      show_status
      ;;
    verify)
      verify_all
      ;;
    logs)
      tail_logs "$LOG_TARGET"
      ;;
    help)
      usage
      ;;
    *)
      die "未知动作：$ACTION"
      ;;
  esac
}

main "$@"

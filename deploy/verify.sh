#!/usr/bin/env bash
# 验证脚本 - 检查所有修复是否生效
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_ROOT="${ES_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

echo "=========================================="
echo "  部署验证脚本"
echo "=========================================="
echo ""

# 检查修复1：启动脚本是否包含保持运行逻辑
echo "[1/6] 检查启动脚本修复..."
if grep -q "所有服务启动流程完成" "${ES_ROOT}/deploy/start.sh"; then
    echo "✅ 启动脚本已添加保持运行机制"
else
    echo "❌ 启动脚本未修复"
    exit 1
fi

# 检查修复2：健康检查是否使用IPv4
echo "[2/6] 检查健康检查修复..."
if grep -q 'http://127.0.0.1:3080/health' "${ES_ROOT}/deploy/start.sh"; then
    echo "✅ LibreChat健康检查已修复为IPv4"
else
    echo "❌ 健康检查仍使用IPv6"
    exit 1
fi

# 检查修复3：LibreChat DOMAIN配置
echo "[3/6] 检查LibreChat配置..."
if [ -f "${ES_ROOT}/LibreChat/.env" ] && grep -q 'DOMAIN_' "${ES_ROOT}/LibreChat/.env"; then
    echo "✅ LibreChat .env 存在并包含 DOMAIN 配置"
else
    echo "⚠️ LibreChat .env 不存在或未配置 DOMAIN；本地 smoke test 可跳过，部署前需配置"
fi

# 检查修复4：前端配置
echo "[4/6] 检查前端配置..."
if [ -f "${ES_ROOT}/frontend/.env" ] && grep -qx 'VITE_AGENT_URL=/librechat/' "${ES_ROOT}/frontend/.env"; then
    echo "✅ 前端 .env 存在且 VITE_AGENT_URL=/librechat/"
else
    echo "❌ 前端 .env 缺少正确配置：VITE_AGENT_URL=/librechat/"
    exit 1
fi

# 检查修复5：nginx配置
echo "[5/6] 检查nginx配置..."
if grep -q 'listen 3001' "${ES_ROOT}/deploy/nginx.conf" &&    grep -q 'location \^~ /api/agents/' "${ES_ROOT}/deploy/nginx.conf"; then
    echo "✅ nginx监听3001端口，且 LibreChat Agent SSE 已避开 stock-mcp /api 代理"
else
    echo "❌ nginx端口或 LibreChat Agent SSE 代理配置错误"
    exit 1
fi

# 检查修复6：LibreChat MCP配置
echo "[6/6] 检查LibreChat MCP配置..."
LIBRECHAT_CONFIG="${LIBRECHAT_CONFIG:-${ES_ROOT}/LibreChat/config/librechat.stock-mcp.yaml}"
if [ -f "$LIBRECHAT_CONFIG" ] && \
   grep -q 'stock-mcp:' "$LIBRECHAT_CONFIG" && \
   grep -q 'type: streamable-http' "$LIBRECHAT_CONFIG" && \
   grep -q 'X-User-Id: "{{LIBRECHAT_USER_ID}}"' "$LIBRECHAT_CONFIG" && \
   grep -q 'CONFIG_PATH="${LIBRECHAT_CONFIG}"' "${ES_ROOT}/deploy/start.sh"; then
    echo "✅ LibreChat 将加载 stock-mcp MCP 配置，并按用户注入 X-User-Id"
else
    echo "❌ LibreChat MCP 配置缺失或启动脚本未加载 CONFIG_PATH"
    exit 1
fi

echo ""
echo "=========================================="
echo "  ✅ 所有修复验证通过"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 当前机器测试：bash ${ES_ROOT}/deploy/stop.sh && bash ${ES_ROOT}/deploy/start.sh"
echo "2. 打包镜像部署到玻尔云"
echo ""
echo "部署后验证："
echo "  curl http://127.0.0.1:3001/health"
echo "  curl http://127.0.0.1:3001/librechat/api/config"
echo ""

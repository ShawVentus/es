#!/usr/bin/env bash
# 验证脚本 - 检查所有修复是否生效

echo "=========================================="
echo "  部署验证脚本"
echo "=========================================="
echo ""

# 检查修复1：启动脚本是否包含保持运行逻辑
echo "[1/5] 检查启动脚本修复..."
if grep -q "保持容器运行" /root/deploy/start.sh; then
    echo "✅ 启动脚本已添加保持运行机制"
else
    echo "❌ 启动脚本未修复"
    exit 1
fi

# 检查修复2：健康检查是否使用IPv4
echo "[2/5] 检查健康检查修复..."
if grep -q 'http://127.0.0.1:3080/health' /root/deploy/start.sh; then
    echo "✅ LibreChat健康检查已修复为IPv4"
else
    echo "❌ 健康检查仍使用IPv6"
    exit 1
fi

# 检查修复3：LibreChat DOMAIN配置
echo "[3/5] 检查LibreChat配置..."
if grep -q 'easystat-uuid1766641499.appspace.bohrium.com' /root/LibreChat/.env; then
    echo "✅ LibreChat DOMAIN已更新为正确的外部URL"
else
    echo "❌ LibreChat DOMAIN仍为localhost"
    exit 1
fi

# 检查修复4：前端配置
echo "[4/5] 检查前端配置..."
if grep -q 'VITE_AGENT_URL=/librechat' /root/frontend/.env; then
    echo "✅ 前端AGENT_URL配置正确"
else
    echo "❌ 前端配置错误"
    exit 1
fi

# 检查修复5：nginx配置
echo "[5/5] 检查nginx配置..."
if grep -q 'listen 3001' /root/deploy/nginx.conf; then
    echo "✅ nginx监听3001端口"
else
    echo "❌ nginx端口配置错误"
    exit 1
fi

echo ""
echo "=========================================="
echo "  ✅ 所有修复验证通过"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 当前机器测试：bash /root/deploy/stop.sh && bash /root/deploy/start.sh"
echo "2. 打包镜像部署到玻尔云"
echo ""
echo "部署后验证："
echo "  curl http://127.0.0.1:3001/health"
echo "  curl http://127.0.0.1:3001/librechat/api/config"
echo ""

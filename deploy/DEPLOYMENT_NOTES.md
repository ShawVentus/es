# 部署修复说明

## 已修复的问题

### 1. 容器启动后立即退出 ✅
**问题**：`bash /root/deploy/start.sh` 执行完就退出，导致容器停止
**修复**：添加无限循环保持容器运行，并每60秒检查关键服务状态

**代码位置**：`/root/deploy/start.sh:512-540`

### 2. LibreChat健康检查失败 ✅
**问题**：使用IPv6地址 `http://[::1]:3080` 检查LibreChat，但服务监听在IPv4
**修复**：改为 `http://127.0.0.1:3080/health`

**代码位置**：`/root/deploy/start.sh:421`

### 3. LibreChat DOMAIN配置错误 ✅
**问题**：配置为 `http://localhost:3001`，导致浏览器安全策略阻止
**修复**：改为 `https://easystat-uuid1766641499.appspace.bohrium.com/librechat`

**代码位置**：`/root/LibreChat/.env:32-33`

## 重新部署步骤

### 方案A：重启服务（当前机器测试）

```bash
# 1. 停止所有服务
bash /root/deploy/stop.sh

# 2. 重新启动（会保持运行）
bash /root/deploy/start.sh

# 3. 验证服务（另开终端）
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/librechat/api/config
```

### 方案B：打包镜像部署到玻尔云

#### 前提条件
玻尔云会将整个 `/root` 目录打包成镜像，启动命令为：
```bash
bash /root/deploy/start.sh
```

#### 镜像要求
1. ✅ 启动命令不会退出（已修复）
2. ✅ nginx监听3001端口（已配置）
3. ✅ 健康检查endpoint：`http://容器IP:3001/health`

#### 验证checklist
- [ ] 容器启动后，`bash /root/deploy/start.sh` 进程保持运行
- [ ] 日志输出到 `/root/deploy/logs/startup.log`
- [ ] 3001端口可访问：`curl http://10.5.16.255:3001/health` 返回200
- [ ] LibreChat可访问：`curl http://10.5.16.255:3001/librechat/` 返回HTML

## 已知问题

### 问题1：外部503错误（未解决）
**现象**：`https://easystat-uuid1766641499.appspace.bohrium.com/librechat/` 返回503
**原因**：玻尔云平台nginx无法连接到容器nginx (dial tcp 10.5.16.255:3001)

**可能的原因**：
1. 玻尔云健康检查未通过，认为容器未就绪
2. 端口映射配置问题
3. 容器启动时间过长，超过平台超时时间

**验证方法**：
```bash
# 在玻尔云容器内执行
netstat -tlnp | grep 3001
# 应该看到：tcp  0  0  0.0.0.0:3001  0.0.0.0:*  LISTEN

curl http://127.0.0.1:3001/health
# 应该返回：healthy
```

**需要玻尔云平台支持**：
- 确认健康检查路径配置为 `/health`
- 确认超时时间足够（建议至少300秒，因为启动需要时间）
- 检查容器网络配置

### 问题2：域名硬编码（临时方案）
**现象**：DOMAIN配置写死为 `easystat-uuid1766641499.appspace.bohrium.com`
**影响**：如果域名变化，需要重新修改配置并重启LibreChat

**优化方案**（未实施）：
使用环境变量动态获取域名，在启动脚本中：
```bash
# 从玻尔云环境变量获取
export DOMAIN_BASE="${BOHRIUM_PUBLIC_URL:-https://easystat-uuid1766641499.appspace.bohrium.com}"
# 替换.env文件
sed -i "s|DOMAIN_CLIENT=.*|DOMAIN_CLIENT=${DOMAIN_BASE}/librechat|" /root/LibreChat/.env
```

## 日志查看

```bash
# 主启动日志
tail -f /root/deploy/logs/startup.log

# nginx日志
tail -f /root/deploy/logs/nginx_access.log
tail -f /root/deploy/logs/nginx_error.log

# LibreChat日志
tail -f /root/deploy/logs/librechat.log

# stock-mcp日志
tail -f /root/deploy/logs/stock-mcp.log
```

## 服务端口

| 服务 | 端口 | 访问方式 |
|------|------|----------|
| nginx | 3001 | 外部访问入口 |
| LibreChat | 3080 | 内部服务（通过nginx代理） |
| stock-mcp | 9898 | 内部服务（通过nginx代理） |
| MongoDB | 27017 | 内部服务 |
| Redis | 6379 | 内部服务 |
| Meilisearch | 7700 | 内部服务 |
| Clash | 7897 | 内部代理（仅stock-mcp使用） |

## 故障排查

### 容器启动后立即停止
```bash
# 查看最后的启动日志
tail -100 /root/deploy/logs/startup.log

# 检查start.sh是否修改正确
grep -A 5 "保持容器运行" /root/deploy/start.sh
```

### 外部无法访问3001端口
```bash
# 容器内验证nginx
netstat -tlnp | grep 3001
curl http://127.0.0.1:3001/health

# 检查防火墙（如果有）
iptables -L -n | grep 3001
```

### LibreChat加载失败
```bash
# 检查LibreChat配置
grep DOMAIN /root/LibreChat/.env

# 检查LibreChat是否启动
ps aux | grep LibreChat

# 测试LibreChat API
curl http://127.0.0.1:3080/health
curl http://127.0.0.1:3001/librechat/api/config
```

## 联系支持

如果503错误持续存在，需要联系玻尔云技术支持，提供以下信息：
1. 容器ID/部署ID
2. 容器内日志：`/root/deploy/logs/startup.log`
3. 健康检查结果：`curl http://127.0.0.1:3001/health`
4. 错误信息：`dial tcp 10.5.16.255:3001: connect: connection refused`

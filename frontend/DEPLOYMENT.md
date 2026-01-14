# 部署指南

本应用是纯前端静态单页应用 (SPA)，可以部署在任何静态文件服务器上。

## Docker 部署 (推荐)

我们提供了标准的 Docker 部署方案，使用 Nginx 作为 Web 服务器。

### 1. Dockerfile

```dockerfile
# 构建阶段
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 运行阶段
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 2. Nginx 配置 (nginx.conf)

```nginx
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # 启用 gzip 压缩
    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 处理 SPA 路由 (所有路径重定向到 index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
```

## 手动部署

### 1. 构建

```bash
npm run build
```

### 2. 上传

将 `dist` 目录下的所有文件上传到你的 Web 服务器根目录（如 Nginx 的 `/var/www/html`）。

### 3. 配置

确保 Web 服务器配置了 SPA 路由重写规则（即所有 404 请求重定向到 `index.html`）。

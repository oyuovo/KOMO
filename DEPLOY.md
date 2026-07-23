# KOMO 生产部署指南

本文档指导你在一台 Linux VPS 上部署 KOMO 全栈应用。

## 架构概览

```
                    ┌──────────┐
                    │  Nginx   │ :80/:443 → HTTPS 反向代理
                    └────┬─────┘
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    :3000 (Next.js)  :8081 (Spring)  :8001 (FastAPI)
    [静态文件+SSR]   [业务 API]     [AI 服务]
           │             │             │
           └─────────────┼─────────────┘
                         ▼
              ┌──────────────────┐
              │  Docker Compose   │
              │  PG / ES / MQ     │
              └──────────────────┘
```

## 1. 前置要求

- **VPS**: 2 核 CPU / 4 GB RAM 以上（Elasticsearch 需要至少 512 MB 堆内存）
- **OS**: Ubuntu 22.04+ / Debian 12+
- **域名**: 一个已解析到 VPS IP 的域名（例如 `komo.example.com`）
- **软件**:
  - Docker + Docker Compose v2
  - JDK 21
  - Node.js 20+
  - Nginx
  - Certbot（Let's Encrypt）

### 安装依赖

```bash
# Docker
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER

# JDK 21
sudo apt install -y openjdk-21-jdk-headless

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. 克隆项目

```bash
git clone https://github.com/oyuovo/KOMO.git /opt/komo
cd /opt/komo
```

## 3. 配置环境变量

```bash
# 从模板创建
cp docker/.env.example docker/.env

# 生成随机密钥（每个变量独立生成）
echo "JWT_SECRET=$(openssl rand -base64 32)" >> docker/.env
echo "DB_PASSWORD=$(openssl rand -base64 24)" >> docker/.env
echo "RABBITMQ_PASS=$(openssl rand -base64 24)" >> docker/.env
echo "ES_PASSWORD=$(openssl rand -base64 24)" >> docker/.env

# 编辑 docker/.env，填入你的 DeepSeek API Key
nano docker/.env
```

**完整的 `docker/.env` 示例：**

```ini
DB_NAME=komo
DB_USER=komo
DB_PASSWORD=<生成的密码>
RABBITMQ_USER=komo
RABBITMQ_PASS=<生成的密码>
ES_USERNAME=elastic
ES_PASSWORD=<生成的密码>
JWT_SECRET=<生成的 256-bit base64>
DEEPSEEK_API_KEY=sk-your-key-here
```

## 4. 调整生产配置

### docker-compose.yml（生产模式）

在 `docker/docker-compose.yml` 中做以下调整：

**关闭调试端口映射（安全）：**
```yaml
# 仅 localhost 可访问 — 改为不要暴露到公网
ports:
  - "127.0.0.1:5434:5432"   # PG
  - "127.0.0.1:5672:5672"   # RabbitMQ
  - "127.0.0.1:9201:9200"   # ES
  - "127.0.0.1:8001:8001"   # AI Service
```

**AI 服务关闭热重载：**
```yaml
ai-service:
  command: uvicorn app.main:app --host 0.0.0.0 --port 8001
  # 删除 --reload（生产环境不需要）
  # 删除 volumes 挂载（使用镜像内的代码）
```

### Spring Boot 生产环境变量

创建 `KOMO/backend/src/main/resources/application-prod.yml`（可选），或通过环境变量覆盖：

```bash
# 在启动后端前 export
export DB_HOST=localhost
export DB_PORT=5434
export DB_USER=komo
export DB_PASSWORD=<从 docker/.env 获取>
export RABBITMQ_HOST=localhost
export RABBITMQ_PORT=5672
export RABBITMQ_USER=komo
export RABBITMQ_PASS=<从 docker/.env 获取>
export ES_USERNAME=elastic
export ES_PASSWORD=<从 docker/.env 获取>
export JWT_SECRET=<从 docker/.env 获取>
export AI_SERVICE_URL=http://localhost:8001
```

## 5. 启动基础设施

```bash
cd /opt/komo/docker
docker compose up -d
```

验证：
```bash
docker ps --format "{{.Names}}: {{.Status}}"
# 预期输出：
# komo-postgres: Up ...
# komo-es: Up ...
# komo-rabbitmq: Up ...
# komo-ai: Up ...
```

## 6. 构建并启动后端

```bash
cd /opt/komo/KOMO/backend

# 导出生产环境变量（或使用 systemd EnvironmentFile）
export $(grep -v '^#' /opt/komo/docker/.env | xargs)
export DB_HOST=localhost DB_PORT=5434
export RABBITMQ_HOST=localhost RABBITMQ_PORT=5672
export ES_USERNAME=elastic
export AI_SERVICE_URL=http://localhost:8001

# 编译并启动
mvn spring-boot:run -Dmaven.test.skip=true -Dspring-boot.run.profiles=prod
```

### 使用 systemd 管理后端

创建 `/etc/systemd/system/komo-backend.service`：

```ini
[Unit]
Description=KOMO Backend
After=network.target docker.service

[Service]
Type=simple
User=komo
WorkingDirectory=/opt/komo/KOMO/backend
EnvironmentFile=/opt/komo/docker/.env
Environment=DB_HOST=localhost
Environment=DB_PORT=5434
Environment=RABBITMQ_HOST=localhost
Environment=RABBITMQ_PORT=5672
Environment=ES_USERNAME=elastic
Environment=AI_SERVICE_URL=http://localhost:8001
Environment=JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ExecStart=/usr/bin/mvn spring-boot:run -Dmaven.test.skip=true
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动：
```bash
sudo useradd -r -s /bin/false komo
sudo chown -R komo:komo /opt/komo
sudo systemctl daemon-reload
sudo systemctl enable --now komo-backend
```

## 7. 构建并部署前端

### 生产构建

```bash
cd /opt/komo/KOMO/frontend/packages/web

# 创建生产环境配置 .env.production
echo "NEXT_PUBLIC_API_URL=https://komo.example.com/api" > .env.production

npm install
npx next build
```

构建产物在 `.next/` 目录。

### 使用 Next.js standalone 模式（推荐）

编辑 `next.config.js`（如不存在则创建）：
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

重新构建后，standalone 产物在 `.next/standalone/`：
```bash
# 启动前端（使用 systemd 或 pm2）
node .next/standalone/server.js
```

### 使用 systemd 管理前端

创建 `/etc/systemd/system/komo-frontend.service`：

```ini
[Unit]
Description=KOMO Frontend
After=network.target

[Service]
Type=simple
User=komo
WorkingDirectory=/opt/komo/KOMO/frontend/packages/web
Environment=NEXT_PUBLIC_API_URL=https://komo.example.com/api
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node /opt/komo/KOMO/frontend/packages/web/.next/standalone/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 8. Nginx 反向代理 + HTTPS

### 站点配置

创建 `/etc/nginx/sites-available/komo`：

```nginx
# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name komo.example.com;
    return 301 https://$host$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name komo.example.com;

    # SSL 证书（certbot 自动管理）
    ssl_certificate     /etc/letsencrypt/live/komo.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/komo.example.com/privkey.pem;

    # 安全头
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    client_max_body_size 5M;

    # 前端（Next.js）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;  # SSE 长连接
    }

    # 后端 API（Spring Boot）
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }
}
```

启用站点并获取证书：

```bash
sudo ln -s /etc/nginx/sites-available/komo /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # 删除默认站点
sudo nginx -t
sudo systemctl reload nginx

# 获取 Let's Encrypt 证书
sudo certbot --nginx -d komo.example.com
```

## 9. 数据备份

### PostgreSQL 定时备份

创建 `/opt/komo/scripts/backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR=/opt/komo/backups
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 读取密码
source /opt/komo/docker/.env

# 导出
docker exec komo-postgres pg_dump -U komo komo | gzip > "$BACKUP_DIR/komo_$TIMESTAMP.sql.gz"

# 删除旧备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: komo_$TIMESTAMP.sql.gz"
```

添加 crontab（每天凌晨 2:00）：

```bash
chmod +x /opt/komo/scripts/backup.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/komo/scripts/backup.sh >> /var/log/komo-backup.log 2>&1") | crontab -
```

### 恢复

```bash
gunzip -c /opt/komo/backups/komo_20260722_020000.sql.gz | \
  docker exec -i komo-postgres psql -U komo -d komo
```

## 10. 健康检查

```bash
# Docker 容器
docker ps --format "table {{.Names}}\t{{.Status}}"

# AI 服务
curl http://localhost:8001/health

# 后端
curl http://localhost:8081/api/health

# 前端
curl -o /dev/null -s -w "%{http_code}" http://localhost:3000

# 全链路
curl https://komo.example.com/api/health
```

## 11. 日志

```bash
# Docker 容器日志
docker logs komo-postgres --tail 50
docker logs komo-ai --tail 50
docker logs komo-es --tail 50

# 后端日志（systemd）
sudo journalctl -u komo-backend -f

# 前端日志（systemd）
sudo journalctl -u komo-frontend -f

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 12. 常见问题

### ES 启动失败：vm.max_map_count 过低

```bash
sudo sysctl -w vm.max_map_count=262144
# 持久化
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### RabbitMQ 连接被拒绝

检查 `RABBITMQ_PASS` 在 `docker/.env` 和启动后端的 shell 环境中是否一致。

### AI 提取不工作

```bash
# 检查 AI 服务是否可达
curl http://localhost:8001/health

# 检查 DeepSeek API Key
docker logs komo-ai | grep FATAL
```

### HTTPS 证书自动续期

Certbot 会自动续期（已安装 timer）。手动测试：

```bash
sudo certbot renew --dry-run
```

## 快速部署清单

- [ ] VPS 安装 Docker、JDK 21、Node.js 20、Nginx
- [ ] 克隆项目到 `/opt/komo`
- [ ] 配置 `docker/.env`（所有密码和密钥）
- [ ] 调整 `docker-compose.yml` 端口绑定到 `127.0.0.1`
- [ ] `docker compose up -d` 启动基础设施
- [ ] 配置后端 systemd service 并启动
- [ ] `npx next build` 构建前端，配置 systemd service
- [ ] Nginx 配置 HTTPS + 反向代理
- [ ] Certbot 获取 SSL 证书
- [ ] 配置数据库定时备份
- [ ] 验证全链路 `curl https://domain/api/health`

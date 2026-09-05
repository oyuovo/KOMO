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

### docker-compose 生产覆盖层

**不要手改 `docker/docker-compose.yml`** —— 那是本地开发用的，改了会与仓库版本持续冲突。
生产用随仓提供的覆盖文件 `docker/docker-compose.prod.yml`，它做了三件事：

1. **数据端口全部改绑 `127.0.0.1`** —— PG(5434)、ES(9201)、RabbitMQ(5672)、AI(8001)。
   基础文件把它们发布到 `0.0.0.0`，在公网服务器上等于直接摆到全网扫描器面前。
2. **15672 RabbitMQ 管理台不再发布**。确实需要看的时候用 SSH 转发，不要改配置：
   ```bash
   ssh -L 15672:127.0.0.1:15672 user@server
   ```
3. **AI 服务去掉热重载与源码挂载** —— 跑的必须是镜像里构建进去的代码：
   ```yaml
   command: uvicorn app.main:app --host 0.0.0.0 --port 8001   # 无 --reload
   volumes: !override []                                       # 无源码挂载
   ```

> `ports` / `volumes` 上的 `!override` 标签不能省。Compose 对这两个多值字段的合并语义是
> **追加**而不是替换：不加标签的话端口会新旧共存（宿主机端口重复分配，启动失败），
> 而 `volumes: []` 等于什么都没改。

部署前先展开确认一遍（不需要 daemon 运行）：
```bash
cd /opt/komo/docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -E 'host_ip|published'
# 预期：所有 host_ip 均为 127.0.0.1，且看不到 15672
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

# —— 仅生产（HTTPS + 反向代理）需要 ——
export COOKIE_SECURE=true          # 认证 Cookie 打 Secure 标记，默认 false（本地 http 开发用）
# export TRUSTED_PROXIES=...       # nginx 与后端不同机时才需设；同机部署用默认回环地址即可
```

> `TRUSTED_PROXIES` 决定限流器采信哪些地址发来的 `X-Forwarded-For`。
> 若 nginx 跑在容器或另一台主机上而不把它的地址加进来，转发头会被全量忽略，
> **登录限流退化为按代理地址统计** —— 所有用户共享一个 5 次/分钟的名额，第 6 个人就登不进去。

## 5. 启动基础设施

```bash
cd /opt/komo/docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
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

### standalone 产物路径（monorepo 注意）

`output: 'standalone'` 已在 `next.config.ts` 中配好，**不需要再建 `next.config.js`**。

⚠️ 本项目是 npm workspaces monorepo，standalone 产物不是平铺在 `.next/standalone/` 根下，
Next.js 会保留 workspace 的相对路径：

```
.next/standalone/
├── node_modules/            # 追踪出的最小依赖集
└── packages/web/
    ├── server.js            # ← 入口在这里，不是 .next/standalone/server.js
    ├── package.json
    └── .next/               # 只有 server/ 与各类 manifest，没有 static/
```

按网上通用的 `.next/standalone/server.js` 去找会直接 `Cannot find module`。

### 手动补齐静态资源

standalone 只打包服务端运行所需文件，`public/` 与 `.next/static/` 必须自己拷进去，
否则页面能打开但所有 JS / CSS / 图片全 404：

```bash
cd /opt/komo/KOMO/frontend/packages/web
cp -r .next/static .next/standalone/packages/web/.next/static
cp -r public      .next/standalone/packages/web/public
```

**每次 `next build` 后都要重拷** —— `.next/standalone` 会被重建，上一次拷进去的不会留着。

### 启动

```bash
node .next/standalone/packages/web/server.js
```

`server.js` 开头就 `process.chdir(__dirname)`，因此从任何目录启动都能正确解析 `.next/` 与 `public/`。
端口由 `PORT` 控制（默认 3000），监听地址由 `HOSTNAME` 控制 ——
**默认是 `0.0.0.0`，生产必须显式设为 `127.0.0.1`**，否则前端绕过 nginx 直接对公网监听。

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
ExecStart=/usr/bin/node /opt/komo/KOMO/frontend/packages/web/.next/standalone/packages/web/server.js
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
        # 必须用 $remote_addr 覆盖，不能用 $proxy_add_x_forwarded_for。
        # 后者会把客户端自带的 XFF 追加保留，而后端限流取最右一跳，
        # 一旦这里改成追加，多层代理下真实 IP 的判定就会错位。
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }

    # 后端 API（Spring Boot）
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;   # 同上：覆盖而非追加
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';

        proxy_read_timeout 180s;   # SSE 长连接（后端 async request-timeout 同为 180s）
        proxy_send_timeout 180s;

        # ⚠️ SSE 必需，勿删。nginx 默认缓冲上游响应，
        # 不关闭的话 AI 回复不再逐字流出，而是憋数秒后整段一次性出现。
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

> **两个不要动的配置**
>
> 1. `proxy_buffering off` —— 删了 SSE 流式就废了。本地开发没有 nginx，所以这个问题只在部署后暴露。
> 2. `X-Forwarded-For $remote_addr` —— 用 `$proxy_add_x_forwarded_for`（追加）会让客户端能伪造转发头。
>    后端 `RateLimitFilter` 只采信来自 `komo.security.trusted-proxies`（默认回环地址）的请求的转发头，
>    且取最右一跳；两层配合才能守住登录爆破限流。**若 nginx 不与后端同机**，
>    必须把 nginx 的地址加进后端的 `TRUSTED_PROXIES` 环境变量，否则限流会退化为按直连地址统计。

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
- [ ] 确认 `docker-compose.prod.yml` 展开后端口均绑 `127.0.0.1`、无 15672
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` 启动基础设施
- [ ] 后端 systemd 设 `COOKIE_SECURE=true`（nginx 不同机时还需 `TRUSTED_PROXIES`）
- [ ] 配置后端 systemd service 并启动
- [ ] `npx next build` 构建前端，配置 systemd service
- [ ] Nginx 配置 HTTPS + 反向代理
- [ ] Certbot 获取 SSL 证书
- [ ] 配置数据库定时备份
- [ ] 验证全链路 `curl https://domain/api/health`

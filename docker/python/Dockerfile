# docker/python/Dockerfile
FROM python:3.12-slim

# 国内构建加速用的两个参数，默认值均为官方源，本地/境外构建不受影响。
# 境内服务器构建时显式传入（否则 apt 与 pip 走境外源，实测 20 分钟未完成）：
#   docker compose build \
#     --build-arg APT_MIRROR=mirrors.tencentyun.com \
#     --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn \
#     ai-service
# APT_MIRROR 留空则不改源。腾讯云内网源 mirrors.tencentyun.com 不计流量费。
ARG APT_MIRROR=
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

# 系统依赖（curl 用于健康检查，gcc 等编译工具用于少数无预编译 wheel 的包）
# Debian 12 (bookworm) 用 deb822 格式的 debian.sources，旧镜像用 sources.list，两个都兼顾。
RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        if [ -f "$f" ]; then \
          sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" "$f"; \
        fi; \
      done; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends --fix-missing \
    build-essential \
    curl; \
    rm -rf /var/lib/apt/lists/*

# 先复制 requirements 以利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -i ${PIP_INDEX_URL} -r requirements.txt

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]

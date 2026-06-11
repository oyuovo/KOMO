# docker/python/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# 系统依赖（curl 用于健康检查，gcc 等编译工具用于少数无预编译 wheel 的包）
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 先复制 requirements 以利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]

#!/bin/bash
# KOMO PostgreSQL 每日备份（crontab 02:00 调用，见 DEPLOY.md §9）
# 用法：/opt/komo/deploy/backup.sh
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/opt/komo/backups}
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

umask 077
mkdir -p "$BACKUP_DIR"

# 使用正在运行的 PostgreSQL 容器配置，不把宿主机 .env 当 Bash 代码执行。
# .env 可能使用 CRLF、引号或包含 shell 特殊字符；pg_dump 不需要读取其中的其他密钥。
BACKUP_FILE="$BACKUP_DIR/komo_$TIMESTAMP.sql.gz"
PARTIAL_FILE=$(mktemp "$BACKUP_DIR/.komo_$TIMESTAMP.XXXXXX.partial")
trap 'rm -f -- "$PARTIAL_FILE"' EXIT

# 导出；pg_dump 失败时 set -e 会中断脚本，避免生成空备份还自我感觉良好
docker exec komo-postgres sh -c 'exec pg_dump -U "${POSTGRES_USER:-komo}" "${POSTGRES_DB:-komo}"' | gzip > "$PARTIAL_FILE"
gzip -t "$PARTIAL_FILE"

# 校验产物非空（gzip 空输入也会产出约 20 字节的头，用大小阈值挡一下）
if [ "$(stat -c%s "$PARTIAL_FILE")" -lt 1024 ]; then
    echo "ERROR: backup file suspiciously small, pg_dump likely failed" >&2
    exit 1
fi
mv -- "$PARTIAL_FILE" "$BACKUP_FILE"

# 删除旧备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: komo_$TIMESTAMP.sql.gz"

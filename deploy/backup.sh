#!/bin/bash
# KOMO PostgreSQL 每日备份（crontab 02:00 调用，见 DEPLOY.md §9）
# 用法：/opt/komo/deploy/backup.sh
set -euo pipefail

BACKUP_DIR=/opt/komo/backups
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 读取密码（DB_USER 等）
source /opt/komo/docker/.env

# 导出；pg_dump 失败时 set -e 会中断脚本，避免生成空备份还自我感觉良好
docker exec komo-postgres pg_dump -U "${DB_USER:-komo}" "${DB_NAME:-komo}" | gzip > "$BACKUP_DIR/komo_$TIMESTAMP.sql.gz"

# 校验产物非空（gzip 空输入也会产出约 20 字节的头，用大小阈值挡一下）
if [ "$(stat -c%s "$BACKUP_DIR/komo_$TIMESTAMP.sql.gz")" -lt 1024 ]; then
    echo "ERROR: backup file suspiciously small, pg_dump likely failed" >&2
    exit 1
fi

# 删除旧备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: komo_$TIMESTAMP.sql.gz"

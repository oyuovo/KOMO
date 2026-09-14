#!/bin/bash
# KOMO 前端生产构建 + standalone 静态资源补齐
# 用法：./frontend-build.sh <生产域名>    例：./frontend-build.sh komo.example.com
#
# monorepo 两个坑（详见 DEPLOY.md §7）：
#   1. standalone 入口在 .next/standalone/packages/web/server.js，不是 .next/standalone/server.js
#   2. standalone 不含 public/ 与 .next/static/，不拷就是无样式白页 + 全部资源 404；
#      且每次 next build 会重建 .next/standalone，必须每次构建后重拷 —— 所以固化成本脚本
set -euo pipefail

DOMAIN="${1:?用法: $0 <生产域名>}"
WEB_DIR="$(cd "$(dirname "$0")/../KOMO/frontend/packages/web" && pwd)"
cd "$WEB_DIR"

echo "==> 写入 .env.production (NEXT_PUBLIC_API_URL=https://$DOMAIN/api)"
echo "NEXT_PUBLIC_API_URL=https://$DOMAIN/api" > .env.production

echo "==> 安装依赖（workspace 根）"
(cd ../.. && npm install)

echo "==> next build"
npx next build

echo "==> 补齐静态资源到 standalone"
cp -r .next/static .next/standalone/packages/web/.next/static
cp -r public      .next/standalone/packages/web/public

echo "==> 完成。入口: $WEB_DIR/.next/standalone/packages/web/server.js"
echo "    启动前记得: PORT=3000 HOSTNAME=127.0.0.1（见 deploy/komo-frontend.service）"

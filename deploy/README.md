# 更新现有服务器

当前脚本 `deploy.ps1` 支持 `frontend`、`backend`、`all`，其中 `all` 只指 Web 和 Java。Python AI 服务、Compose 配置与 systemd unit 需要单独更新。`frontend-build.sh` 只负责在 Linux 上构建前端，不负责上传。

以下命令对应仓库现有配置：SSH 为 `ubuntu@43.142.82.207`，服务器目录为 `/opt/komo`，外部域名为 `https://9any.cn`。这些是仓库配置，未在本次推送中连接服务器核实。服务器按既有方案使用源码归档，不依赖 `git pull`。

## 这次完整更新

这次同时修改了 Java 的 SSE 换行与草稿处理、Python 的提取结果解析、Web 草稿交互及桌面兼容配置。只更新前端无法解决草稿不生成。

先在本地 PowerShell、仓库根目录打包已提交的 AI 源码及部署配置。`git archive` 只收录提交里的文件，不包含本地 `.env`、数据库、日志或诊断备份。之后若有尚未提交的新修改，要先提交才会进入这个归档。

```powershell
Set-Location E:\KnowledgeOnMyOwn_Project
git archive --format=tar.gz -o komo.tar.gz HEAD KOMO/ai-service/app docker deploy
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
scp .\komo.tar.gz ubuntu@43.142.82.207:/tmp/komo-update.tar.gz
if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
ssh ubuntu@43.142.82.207
```

进入服务器后，先备份数据库及当前源码配置。备份可能含环境密钥，保存在服务器上，不要提交到 GitHub。以下操作保留 Docker 数据卷；不用 `down -v`，也不删除 ES 索引。

```bash
set -e
cd /opt/komo
sudo bash deploy/backup.sh
sudo sh -c 'umask 077; tar -czf /opt/komo/backups/code-config-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt/komo KOMO/ai-service/app docker deploy'
tar -xzf /tmp/komo-update.tar.gz -C /opt/komo

# 原服务器的 docker/.env 会保留；压缩包不包含它。
cd /opt/komo/docker
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet

# 基础镜像仍是 ES 8.12.0，构建增加 analysis-smartcn 插件。
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build elasticsearch
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps elasticsearch ai-service
# Python 源码是只读挂载，配置没变时 up 不会重启它，必须显式 restart。
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml restart ai-service
sudo docker exec komo-es bin/elasticsearch-plugin list
curl -fsS http://127.0.0.1:8001/health
```

ES 插件不会改变现有索引的分词器，也不会自动重建知识数据。构建可能需要从外网下载插件；失败时先解决下载问题，不要跳过失败继续更新。此轮 Python 依赖未变，无须重建 AI 依赖镜像。

本次后端 unit 加入了桌面客户端的 CORS Origin。先查看服务器的定制项，再安装仓库 unit；如果线上有额外域名、JVM 参数或路径，保留这些配置。仅更新 JAR 不会更新 systemd 配置。

```bash
sudo systemctl cat komo-backend
# 确认 /opt/komo/deploy/komo-backend.service 与线上所需配置一致后执行：
sudo install -m 644 /opt/komo/deploy/komo-backend.service /etc/systemd/system/komo-backend.service
sudo systemctl daemon-reload
exit
```

回到本地 PowerShell，先更新 Java，再更新 Web。需要本机 `mvn`、`npm`、`npx`、`ssh`、`scp`、`tar` 可用，以及 Java 21。脚本构建并直接上传当前工作区产物，可能要求输入 SSH 或 sudo 密码。

```powershell
Set-Location E:\KnowledgeOnMyOwn_Project
$env:JAVA_HOME = 'D:\environment\jdk21'
$env:Path = "$env:JAVA_HOME\bin;D:\develop\apache-maven-3.9.11-bin\apache-maven-3.9.11\bin;C:\Program Files\nodejs;$env:Path"
$env:NEXT_BUILD_TARGET = 'web'
$env:NEXT_PUBLIC_AUTH_MODE = 'cookie'
$env:NEXT_PUBLIC_API_URL = '/api'
.\deploy\deploy.ps1 backend
.\deploy\deploy.ps1 frontend
```

Web 发布应使用上述环境变量，避免继承桌面构建的 bearer 模式或静态导出配置。脚本目前会跳过 Java 测试，所以发布前应先完成测试；也不会自动回滚或为 JAR 留副本，发布前可在服务器另存现有 `/opt/komo/komo-backend.jar`。前端 standalone 是在本机构建后上传，仍需检查线上 Linux 实际启动情况。

最后重新登录服务器检查，不能只以脚本打印成功作为验收：

```bash
systemctl is-active komo-backend komo-frontend
curl -fsS http://127.0.0.1:8081/api/health
curl -fsS http://127.0.0.1:8001/health
curl -fsS -o /dev/null -w 'Web HTTP %{http_code}\n' https://9any.cn/
sudo journalctl -u komo-backend -n 80 --no-pager
sudo docker logs --tail 80 komo-ai
```

再用线上账号发起一轮对话，检查标题和列表换行，并等待待审草稿生成。本地测试账号、已有对话和草稿不会随 Git 推送或这套部署操作传到服务器。桌面安装包也不由这些脚本发布，需要另行构建。

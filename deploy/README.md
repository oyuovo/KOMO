# 更新现有服务器

当前脚本 `deploy.ps1` 支持 `frontend`、`backend`、`all`，其中 `all` 只指 Web 和 Java。Python AI 服务、Compose 配置与 systemd unit 需要单独更新。`frontend-build.sh` 只负责在 Linux 上构建前端，不负责上传。

以下命令对应仓库现有配置：SSH 为 `ubuntu@43.142.82.207`，服务器目录为 `/opt/komo`，外部域名为 `https://9any.cn`。这些是仓库配置，未在本次推送中连接服务器核实。服务器按既有方案使用源码归档，不依赖 `git pull`。

## 这次完整更新

2026-10-17注册收口：当前部署定位为个人自用，后端的`REGISTRATION_ENABLED`默认是`false`。新JAR会在创建账号前拒绝注册，返回HTTP 403；已有账号登录和续期照常工作。Web和桌面共用的登录页读取`GET /api/auth/config`，只有服务端明确返回`registrationEnabled: true`才显示注册入口。请求失败、旧后端没有该接口或配置缺失时，入口保持隐藏。

本轮发布需要先更新后端，再更新前端。只更新前端不能关闭旧后端的注册接口。服务器`docker/.env`由现有systemd服务读取，可显式加入`REGISTRATION_ENABLED=false`；若已有同名设置，应修改原行，避免重复。没有该变量时新版默认关闭，不需要为此替换systemd unit。修改环境变量后需重启Java服务。此前的登录修复和Python异步调用改动也在此次提交范围内，完整更新仍按下文操作。

部署后执行以下只读检查，确认`data.registrationEnabled`为`false`，再打开登录页确认没有注册入口，并用已有账号登录。返回404说明后端版本未更新，不能据此前端隐藏推断接口已关闭。

```bash
curl -fsS https://9any.cn/api/auth/config
```

仅在隔离的本地开发环境需要测试注册时，设置`REGISTRATION_ENABLED=true`并重启后端；无需额外的前端构建开关，重新打开登录页即可。测试结束后移除该变量或改回`false`并重启。关闭注册不会删除已有账号，也不会把已向他人分发的账号自动撤销；此开关本身不代表完成任何备案或合规认定。

下文完整更新流程也涵盖此前的Java SSE换行与草稿处理、Python提取解析、Web草稿交互及桌面兼容配置。若服务器尚未更新这些修复，只更新前端无法解决草稿不生成。

先在本地 PowerShell、仓库根目录打包已提交的 AI 源码及部署配置。`git archive` 只收录提交里的文件，不包含本地 `.env`、数据库、日志或诊断备份。之后若有尚未提交的新修改，要先提交才会进入这个归档。

```powershell
Set-Location E:\KnowledgeOnMyOwn_Project
git archive --format=tar.gz -o komo.tar.gz HEAD KOMO/ai-service/app docker deploy
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
scp .\komo.tar.gz ubuntu@43.142.82.207:/tmp/komo-update.tar.gz
if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
ssh ubuntu@43.142.82.207
```

进入服务器后，先备份数据库及当前源码配置。备份可能含环境密钥，保存在服务器上，不要提交到 GitHub。以下操作保留 Docker 数据卷；不用 `down -v`，保留旧检索卷用于回退。

在交互式 SSH 中逐步执行并检查返回结果，不要先设置 `set -e`，否则一个失败命令就可能结束 SSH 会话。若旧备份脚本在 `source .env` 时报 `$'\r': command not found`，先单独上传新版 `deploy/backup.sh`；新版直接读取容器配置，不需要修改服务器密钥文件。

```bash
cd /opt/komo
sudo bash deploy/backup.sh
# 若上一步失败，停在这里排查，不要继续覆盖服务器代码。
sudo sh -c 'umask 077; tar -czf /opt/komo/backups/code-config-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt/komo KOMO/ai-service/app docker deploy'
tar -xzf /tmp/komo-update.tar.gz -C /opt/komo

# 原服务器的 docker/.env 会保留；压缩包不包含它。
cd /opt/komo/docker
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet

# 先在docker/.env配置AI_INTERNAL_TOKEN，并向Java提供相同值。
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build ai-service
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d qdrant ai-service
# Python 源码是只读挂载，配置没变时 up 不会重启它，必须显式 restart。
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml restart ai-service
curl -fsS http://127.0.0.1:8001/health
```

Python依赖已变更，必须重建AI镜像。首次检索需下载embedding模型，建议先预热，随后从设置页维护检索索引。验证Java、Python与Qdrant的新链路后，再停止并移除旧komo-es容器；不要删除业务数据库或旧数据卷。详见`KOMO/ai-service/RETRIEVAL.md`。

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

再用线上账号打开文档并提问，确认回答完成、原文引用可展开、刷新后回答与引用仍在，并验证普通聊天。草稿提取默认暂停，不应等待新草稿生成。本地测试账号、已有对话和草稿不会随 Git 推送或这套部署操作传到服务器。桌面安装包也不由这些脚本发布，需要另行构建。

## 后端就绪检查与 exit code 7（2026-10-15）

`systemctl` 显示 `active` 代表 Java 进程在运行，不代表 Spring Boot 已经监听 HTTP 端口。旧脚本只等待 3 秒就请求一次健康接口；如果此时尚未监听，会打印 `backend http 000`，curl 以 7 退出，SSH 再把这个远程退出码传回 PowerShell。服务随后也可能启动成功，不能仅凭这条异常判定 JAR 上传失败或 SSH 连接失败；启动崩溃与端口错误仍需日志确认。

后端部署现在使用本地 `deploy/backend-health.sh`，将其内容嵌入现有 SSH 命令，无需在服务器另行安装脚本。重启后默认最多等待 120 秒，约每 2 秒重试；每个请求有连接/总时限，直接检查 `127.0.0.1:8081` 并绕过代理，只有服务 active 且健康接口 HTTP 200 才通过。持续连接失败、HTTP 3xx/4xx/5xx、服务退出均不会被当作成功；最终失败会显示服务状态与最近 80 行日志，不会自动回滚 JAR。

原命令可继续使用，较慢服务器可显式调整超时（5–900 秒）：

```powershell
.\deploy\deploy.ps1 backend -HealthTimeoutSeconds 180
```

若旧脚本已经上传并重启，但只在检查时失败，先只读确认现状，避免重复构建和重启：

```powershell
curl.exe -fsS https://9any.cn/api/health
ssh ubuntu@43.142.82.207
```

进入服务器后：

```bash
systemctl show komo-backend -p ActiveState -p SubState -p Result -p ExecMainStatus -p NRestarts
curl --noproxy '*' -fsS --max-time 5 http://127.0.0.1:8081/api/health
sudo journalctl -u komo-backend -n 80 --no-pager
```

本次只读公开健康检查返回 HTTP 200、`data.status=UP`，支持“当时检查过早”的判断，但未读取服务器启动日志，不能据此确定准确启动耗时或所有依赖/业务功能正常。本地已通过 PowerShell 5.1/7 语法检查、10 项真实 helper 的隔离回归，以及实际部署脚本在 mock mvn/scp/ssh 下的命令拼接与失败传播检查。没有执行线上重启或重新部署，没有修改数据库、环境密钥或无关工作区文件。

可重复的本地回归（Git Bash/Linux；命令均为测试替身，不连接服务器）：

```bash
bash deploy/tests/backend-health-test.sh
```

# KOMO桌面客户端（Windows）

KOMO桌面端基于Tauri v2构建，将Web前端静态导出后由内置WebView2加载，连接远程后端服务。目前用于本人使用和本地开发验证，以下为安装与构建说明。

注册默认关闭。登录页从后端`/api/auth/config`读取开关，只有明确开启才显示注册入口；旧后端或网络错误均保持隐藏。后端必须更新到支持`REGISTRATION_ENABLED=false`的版本，才能同时禁止旧客户端直接调用注册接口。现有账号登录不受影响。

## 一、当前构建配置

| 项目 | 值 |
|------|-----|
| 产品名 | KOMO |
| 应用标识 | com.komo.desktop |
| 版本 | 0.1.0 |
| 后端地址 | https://9any.cn/api |
| 认证模式 | bearer（构建期注入NEXT_PUBLIC_AUTH_MODE=bearer） |
| 安装方式 | NSIS，per-user（当前用户，无需管理员权限） |
| 代码签名 | 未签名 |
| WebView2 | downloadBootstrapper（首次运行按需联网下载） |
| 界面语言 | 简体中文 / English |

后端服务https://9any.cn对应的KOMO已完成ICP备案（粤ICP备2026145820号-1）。

## 二、安装包位置

构建成功后，NSIS安装包位于：

```
KOMO/frontend/packages/desktop/src-tauri/target/release/bundle/nsis/KOMO_0.1.0_x64-setup.exe
```

## 三、安装说明（未签名与SmartScreen）

本安装包为自分发、未做代码签名。首次运行时Windows SmartScreen可能拦截并提示“Windows已保护你的电脑”。这是未签名应用的正常现象，不代表软件有问题。按以下步骤继续：

1. 双击运行`KOMO_0.1.0_x64-setup.exe`。
2. 若弹出SmartScreen蓝色警告框，点击其中的“更多信息”链接。
3. 下方出现“仍要运行”按钮，点击即可继续安装。
4. 后续按安装向导完成，安装为当前用户级别，不需要管理员权限。

部分杀毒软件或系统对未签名exe也可能额外提示，选择“允许/信任”即可。

## 四、以zip方式分发时的“解除锁定”

如果不通过安装包、而是把exe或绿色版打包成zip分发，Windows会给从网络下载的文件打上“来自Internet”的锁定标记，导致无法运行或运行异常。解压后需手动解除锁定：

1. 右键点击解压出的exe文件，选择“属性”。
2. 在“常规”选项卡底部，若看到“安全：此文件来自其他计算机，可能被阻止以帮助保护该计算机”，勾选“解除锁定”。
3. 点击“确定”，再运行程序。

也可以对整个zip文件先执行“解除锁定”再解压，解压出的文件即不带锁定标记。

## 五、首次运行需联网

安装包采用WebView2 downloadBootstrapper模式，体积更小。若目标机器尚未安装Microsoft Edge WebView2 Runtime，首次运行安装程序时会自动联网下载并安装该运行库，请保持网络畅通。多数Windows 10/11已内置WebView2，此时不会额外下载。

应用启动后需要联网访问https://9any.cn后端才能登录与使用AI功能。

启动时会先读取本地保存的凭证，再向服务器确认登录状态。如果 access token 已过期，会使用 refresh token 自动续期；只有服务器确认会话失效才需要重新登录。断网、服务暂时不可用或本地凭证读取失败时，界面会显示原因和“重新连接”按钮。

登录成功会等待凭证写入完成后进入知识库，退出登录也会等待本地凭证清除完成。现阶段仍使用应用数据目录中的 `komo-auth.json` 明文文件，没有迁移到系统凭证库。已有部分阅读缓存，但离线冷启动仍未完成，不能把它当作完整的离线客户端。

认证回归测试可在 `packages/web` 目录运行 `npm run test:auth`，覆盖延迟读取、过期续期、并发请求、断网重试、持久化和退出登录竞态。测试使用模拟接口，不会访问生产账号或调用 AI 服务。

## 六、修改服务器地址

当前构建已把后端地址固化为https://9any.cn/api。桌面端WebView的origin是http://tauri.localhost，没有nginx同源反代，因此必须使用绝对URL，不能使用相对路径/api（相对路径会被解析到不存在的http://tauri.localhost/api）。

如需更换后端地址，在重新构建时修改注入的环境变量即可：

编辑`KOMO/frontend/packages/desktop/package.json`中的build:web脚本，把NEXT_PUBLIC_API_URL改成目标地址，例如：

```
cross-env NEXT_PUBLIC_API_URL=https://your-domain.example.com/api npm run build:desktop --workspace=web --prefix=../..
```

然后重新执行构建（见第七节）。该环境变量的优先级高于web的.env.production（其中默认是相对路径/api，仅用于nginx同源反代的standalone生产部署），构建期显式注入的进程环境变量会覆盖它。

本地开发调试连接本机后端时，可使用build:web:dev（默认指向http://localhost:8081/api）。

## 七、重新构建

前置条件：已安装Rust工具链（x86_64-pc-windows-msvc）与Node.js，且cargo位于`%USERPROFILE%\.cargo\bin`。

构建前请从托盘菜单彻底退出正在运行的本目录客户端。仅关闭窗口可能仍会常驻托盘，占用`target/release/komo-desktop.exe`，使Rust构建报“拒绝访问”。

在packages/desktop目录下执行：

```
npm run tauri build
```

该命令会先运行build:web（注入桌面端环境变量并把Web静态导出到web/out），再进行Rust release编译并打包NSIS安装程序。首次release编译较慢，通常需要10到30分钟。

单独构建Web桌面产物（不打包安装包）：

```
npm run build:web
```

## 八、构建产物核验

构建完成后，可在web/out的JS产物中确认后端的绝对URL已正确baked：

```
Select-String -Path (Get-ChildItem -Recurse KOMO/frontend/packages/web/out -Filter *.js) -Pattern "9any\.cn/api"
```

命中即表示API地址已固化为https://9any.cn/api，桌面端不会误走相对/api。

# KOMO桌面客户端（Windows）

KOMO桌面端基于Tauri v2构建，将Web前端静态导出后由内置WebView2加载，连接远程后端服务。本文档面向安装包分发与最终用户安装说明。

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

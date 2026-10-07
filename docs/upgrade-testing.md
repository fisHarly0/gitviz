# 安装与升级验证

当前 0.3.0 仍为开发构建；这些检查不代表已正式发布。源码、安装包和插件包必须区分，不能用源码测试替代已安装程序的行为。

## 最新固定构建：03cff8a（2026-10-07）

使用 [CI 37586172143](https://github.com/fisHarly0/gitviz/actions/runs/37586172143) 下载的实际产物，包含地图对比度与缩放焦点修复。三平台源提交、干净工作树标记、文件大小、全部 SHA-256、插件字节一致性及 Unix 执行权限已核对；[验证清单](releases/0.3.0-validation-03cff8a.json) 保存产物与各阶段结果。

| 检查 | 本批结果 |
|---|---|
| Windows 干净 CI runner 安装、重装与卸载 | 通过；保留仓库与 WebView 数据，安装字节仅有已知 NSIS 标记差异 |
| Windows VS Code 1.140.0：0.2.0 → 本批 VSIX | 旧版、升级、重启三个阶段通过；设置保留、安装内容一致，失败记录重启后继续成功 |
| Windows DSH 0.2.0-rc.2 Web：0.2.0 → 本批 tarball | 三阶段通过；安装文件和实际提供的客户端一致，单个 bundle 启用状态及同标签页仓库保留，服务重启后继续成功 |
| Windows 桌面 0.2.0 免安装 → 本批 NSIS | 三阶段通过；两版读取 2000 条历史，隔离存储保留，hook 失败后正常重启并继续成功，卸载保留外部数据 |

所有写入仅针对合成仓库；继续成功均核对父提交、目标 tree、备份和工作区状态。DSH 使用同一个 Integrated Browser 标签页，不声称仓库选择跨关闭浏览器保留。桌面使用共享的隔离 WebView profile，不代表用户默认 AppData 迁移。

证据位于 `F:/Codex/work/gitviz-product/release-03cff8a/`。VS Code 首次驱动在旧版阶段后中断，使用同一已安装 profile 与仓库续跑升级、重启两阶段并通过，未将中断运行算作一次完整成功。DSH 首次在准备测试仓库时触发 Git 30 秒超时，尚未进入升级；保留 `dsh-upgrade/initial-failure/`，增加命令耗时日志后复验三阶段通过，未更改超时或生产代码，根因仍未知。成功记录为各宿主的 `result-{old,upgraded,restarted}.json`，DSH 另有 `outcome.txt`，桌面另有 `desktop-migration-result.json`。

本批未重跑固定包离线编辑及六组正常关闭场景，其证据仍属于下方 `486dae3`。Linux/macOS 原生界面、全面可访问性、陌生用户试用及正式发布仍未完成，不能由本批升级通过替代。

## 历史固定构建：486dae3（2026-10-07 复验）

使用 [CI 37484149175](https://github.com/fisHarly0/gitviz/actions/runs/37484149175) 的实际产物，源提交、干净工作树标记、全部校验和及三平台插件一致性均已核对。完整文件名与 SHA-256 见 [验证清单](releases/0.3.0-validation-486dae3.json)。这批包含离线编辑器和后续地图、失败恢复修复；下方 `51a873c` 是历史证据。

| 检查 | 本批结果 |
|---|---|
| Windows 干净 runner 首次安装、重装、浏览、正常关闭和卸载 | 通过；安装后字节仅有已知 Tauri NSIS 类型标记差异 |
| Windows VS Code 1.140.0：原 0.2.0 → 本批 VSIX | 全流程通过；设置和 Git 状态保留，失败记录跨正常重启后继续成功 |
| Windows DSH 0.2.0-rc.2 Web：原 0.2.0 → 本批 tarball | 全流程通过；安装文件与实际提供的客户端代码核对，启用状态及同标签页仓库保留，重启服务后继续成功 |
| Windows 桌面离线编辑 | 全新 profile 阻断外部 HTTP(S)，五类 worker、许可文本、取消/保存、重启读取与两次关闭复验通过；此前退出超时已定位为测试误选 Tao 内部窗口，驱动已修正 |
| 原桌面 0.2.0 免安装 → 本批 NSIS | 完整流程通过；两版读取 2000 条历史，隔离存储保留，安装版真实 hook 失败后正常重启并继续成功，卸载保留数据 |

本机证据根目录：`F:/Codex/work/gitviz-product/release-486dae3/`。VS Code 最终成功记录位于 `vscode-upgrade-current-host/`，DSH 位于 `dsh-upgrade/`，桌面离线成功复验位于 `offline-editor-close-diagnostic/`；此前失败目录保留，不替换成成功证据。VS Code 驱动改为等候命令实际就绪后用键盘执行，并容许启动期间只读 Webview 文本查询的瞬时上下文切换，Git 与包内容断言保持不变。

2026-10-07 桌面补验：`F:/Codex/work/gitviz-product/desktop-upgrade-20261007-confirmed/` 保存完整升级结果，`desktop-close-20261007/` 保存六组正常关闭保护结果；后者逐组断言原生退出码为 0 且没有终止信号，覆盖草稿、导出保存框、执行中的 hook 和失败提交现场。两项均使用上述固定 CI 产物。

此前安装启动超时仍保留为风险：一次启动仅有 Tao 内部窗口、没有实际 Tauri 窗口；相同安装文件随后在旧/新 profile、快速连续重启和完整升级中通过。`desktop-startup-20261007/` 和 `desktop-profile-probe/` 保留失败及对照证据，尚未定位根因，没有修改生产启动逻辑。升级驱动新增启动日志和有界等待，不能将这些诊断改进描述为产品修复。

## Windows 桌面

`scripts/test-windows-installer.ps1` 在全新测试目录安装 NSIS 包，运行真实 WebView，打开合成 Git 仓库并预览旧提交，然后正常关闭、同版本重装、再次启动和卸载。它检查 WebView 数据保留、仓库 HEAD/状态/引用不变、卸载注册和程序清理，并拒绝覆盖已有 Gitviz 安装。结果和截图保存在指定目录。

本机 0.3.0 与 CI 37283842186 的 Windows 干净 runner 均已通过。CI 的 `Windows installed native application` 步骤成功，`gitviz-install-evidence-*` 中的 JSON 和原生截图已下载核对。首次安装与同版本重装不等于 0.2.0 → 0.3.0 升级。原 0.2.0 桌面只提供免安装程序，没有旧版 NSIS 安装记录可迁移。

## VS Code 0.2.0 → 0.3.0

使用原先保留的 0.2.0 VSIX 和提交 `51a873c` 的 CI 0.3.0 VSIX，在 Windows 的 VS Code 1.131.0 实测：

1. 在独立 profile/extensions 安装旧版，打开合成仓库，加载并选择真实旧提交，确认浏览不修改仓库。
2. 正常退出，在同一配置安装新版并启动。核对实际激活版本、包内代码/资源哈希、manifest 原字段，以及用户设定的每批 20 条历史。Git HEAD、引用、index 字节和工作文件保持原样。
3. 通过新版原生确认执行恢复，由真实 pre-commit hook 拒绝提交，保留失败记录、备份和检查点。
4. 正常退出并重启，核对同一失败记录未变化；移除测试 hook，在原生界面确认继续，核对记录完成、原备份保留、新提交父关系与目标 tree、工作区清洁。

VS Code 会改写 manifest 排版并追加 `__metadata`，因此仅对该文件排除安装元数据后比较 JSON；其他包文件逐字节核验。失败记录在新版中生成，此检查证明其跨重启恢复，不声称原 0.2.0 已有新版操作日志格式。

可用 PowerShell 7、Node 24、Git、已安装 VS Code 和现有 `playwright-core` 复验。脚本只连接实际 VS Code，不下载或启动独立浏览器，不安装到日常配置：

```powershell
./scripts/test-vscode-upgrade.ps1 `
  -OldVsix 'F:/gitviz/artifacts/gitviz-0.2.0.vsix' `
  -NewVsix 'F:/Codex/work/gitviz-product/delivery-ci-linux-51a873c/gitviz-0.3.0.vsix' `
  -TestRoot 'F:/Codex/work/gitviz-product/new-vscode-upgrade-test' `
  -PlaywrightCorePath 'F:/gitviz-work/browser-check/node_modules/playwright-core'
```

包路径按实际下载位置替换，`TestRoot` 必须尚不存在。脚本发现 9235 端口被占用会停止。结果含每阶段实际宿主/插件版本、包 SHA-256、Git HEAD 和截图；正常完成后关闭自己的 VS Code，保留测试目录。不要将测试合成仓库中的 hook 放进用户项目。

本轮证据位于 `F:/Codex/work/gitviz-product/vscode-upgrade-030/`；旧包 SHA-256 和新版 CI 包 SHA-256 见 `result-old.json`、`result-upgraded.json`。整理后的 PowerShell 驱动在包含空格的全新目录 `F:/Codex/work/gitviz-product/vscode upgrade verified/` 再次全部通过，覆盖冷启动引导、升级和重启恢复。测试应用已正常关闭，9235 端口已释放。

## DSH 0.2.0 → 0.3.0

Windows 的 DeepSeek Harness 0.2.0-rc.2 Web profile 已实测原 0.2.0 tarball → 提交 `51a873c` 的 CI 0.3.0 tarball：

- 全新独立 `DSH_HOME`，通过 `dsh plugin --profile web add <包路径>` 安装与更新。启用的 bundle 仍只有一个，安装文件逐项 SHA 与对应 tarball 一致。
- 在 VS Code Integrated Browser 实际打开 DSH。升级后重启 DSH 服务，原浏览器标签页的仓库选择保留；HEAD、引用、index 字节和工作文件不变，旧提交仍可浏览，新地图折叠可用。
- 新版通过界面确认恢复，真实 hook 拒绝提交；再次重启 DSH 后核对同一失败记录原样保留，移除测试 hook，再从界面确认继续提交。备份、父提交、目标 tree、清洁状态和两次尝试记录均正确。
- 从浏览器启动清单解析插件脚本地址，核对服务器返回的客户端代码与安装的 `dist/client.js` 一致；额外内容仅为 DSH 添加的 source-map 注释。不是只验证磁盘上装了新版。

证据位于 `F:/Codex/work/gitviz-product/dsh-upgrade-030/`：`result-{old,upgraded,restarted}.json`、对应 PNG 和 `served-client-verification.json`。新版包 SHA-256 为 `303f7776abd7d12fd8b99367576bc41ae0b5e7b94807fc40a90a2ce94a40c689`。本次在同一浏览器标签页重启服务；没有把 `sessionStorage` 描述为跨关闭浏览器的永久设置。失败记录在新版创建，不声称旧版已有新版日志格式。

开发验收入口为 `tests/dsh-upgrade-smoke.cjs old|upgraded|restarted`，需提供 `GITVIZ_DSH_UPGRADE_ROOT`、`GITVIZ_OLD_DSH`、`GITVIZ_NEW_DSH`、`PLAYWRIGHT_CORE_PATH`。先在该 scratch 的 `home` 中用官方 CLI 安装旧包、以 3087 端口启动 DSH，并用隔离的 VS Code Integrated Browser 打开它；运行 `old`。确认 Git 操作结束后停止自己的服务，官方 CLI 更新包并启动新进程，运行 `upgraded`；再重启服务运行 `restarted`。将每阶段服务 stdout 保存为 scratch 中的 `server-{阶段}.log`，PID 保存为 `dsh.pid`。脚本用启动日志加载对应服务，不输出其登录 URL。所需启动/重启由操作者完成，脚本不会接管日常服务。

本轮只使用合成仓库，没有模型调用；pnpm store 位于 F 盘。自己的 DSH 服务已停止，承载页面的 VS Code 已通过 File → Exit 退出，3087/9235 监听已释放。

## Windows 免安装 0.2.0 → NSIS 0.3.0

原 `artifacts/gitviz-0.2.0.exe` 与提交 `51a873c` 的 CI 安装包已完成真实桌面验收。使用同一个显式隔离的 `WEBVIEW2_USER_DATA_FOLDER`，两版 origin 均为 `http://tauri.localhost`，核对旧偏好值和测试标记保留。这验证存储兼容，不表示在用户默认 AppData 中执行了迁移，也不表示新地图已经采用旧横向偏好。

- 同一合成仓库包含 2000 条提交及分叉/合并；两版均从首批 300 连续加载到全部 2000，键盘定位最早提交。升级与浏览前后 HEAD、引用、index 字节和工作文件不变。
- 安装版确认框核对仓库、实际 HEAD 缩写和完整目标提交；取消不产生记录或 Git 写入。真实 pre-commit hook 拒绝恢复提交后保留备份和检查点。
- 正常关闭安装版并重启，同一失败记录原样保留；取消继续不改 index 和尝试次数。移除测试 hook 后，从界面确认继续，核对目标 tree、原 HEAD 为父提交、备份、作者、清洁状态及同一记录两次尝试完成。
- 卸载后安装程序与注册记录消失，外部仓库、隔离 WebView 数据和原免安装 exe 保留。失败记录由新版创建；旧版没有新版操作记录，不声称迁移旧日志。

```powershell
./scripts/test-desktop-upgrade.ps1 `
  -OldExecutable 'F:/gitviz/artifacts/gitviz-0.2.0.exe' `
  -Installer 'F:/Codex/work/gitviz-product/delivery-ci-windows-51a873c/gitviz_0.3.0_x64-setup.exe' `
  -ExpectedInstalledExecutable 'F:/Codex/work/gitviz-product/delivery-ci-windows-51a873c/gitviz-windows-x64.exe' `
  -TestRoot 'F:/Codex/work/gitviz-product/new-desktop-upgrade-test' `
  -PlaywrightCorePath 'F:/gitviz-work/browser-check/node_modules/playwright-core'
```

路径按实际产物替换；需 PowerShell 7、Node、Git 和已有 Playwright Core，仅连接原生 WebView2。`TestRoot` 必须不存在，检测到已有 Gitviz 安装或 9348 端口占用时拒绝执行。脚本正常关闭自己的应用、卸载测试安装并恢复临时环境变量。

若升级程序等待原生 WebView 超时，会在测试进程仍存活时采集窗口、线程、模块及小型进程转储到该测试目录；仅检查与预期 exe 匹配的 PID。采集失败不覆盖原启动错误，正常关闭另外核对退出码 0。转储只来自隔离验收进程，不自动上传；这是定位能力，不代表间歇性启动问题已修复。

后续 d438d00 的 Windows CI 曾在初始页面就绪后打开仓库超时，不能算作安装验收通过。首次安装驱动现通过可见路径输入和打开按钮进入仓库，并保留失败页面截图/状态；本地同源 NSIS 以及本页最新 03cff8a CI 的首次安装、重装和卸载均已通过。该次与“原生窗口没有出现”的启动风险分别跟踪，不据此声称历史间歇故障根因已修复。

实测证据：`F:/Codex/work/gitviz-product/desktop upgrade confirmed/` 中三阶段 `result-*.json`、PNG、确认文本、失败检查点及 `desktop-migration-result.json`。安装程序和 raw exe 的 SHA 见发行验证清单；安装后的 exe 仅存在 Tauri NSIS 已知类型标记差异，其他字节全部一致，校验方式见 [工程交付说明](delivery.md)。加入该校验的首次安装/重装驱动也在 `installer-payload-check/` 完整通过。

## 仍需验收

Windows 三宿主并发及缺少 Git 的恢复已有独立证据，见 [并发验证](native-concurrency-testing.md) 和 [首次使用](first-use.md)。完整升级复验已通过；仍须定位间歇性 WebView 启动超时，并完成其他操作系统的原生 UI、全面可访问性和陌生用户试用。用户默认 AppData 的实际迁移、签名、公证和正式外部发布不在上述检查范围内。

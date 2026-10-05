# 接续：工程交付与升级验收

项目 F:/gitviz，main；用户持续授权公开产品完善及提交/push。完整目标 spec/modules/public-product.md。P3 工程交付已关闭，P3 发布验证与 P1/P2 剩余项继续，不代表正式发行。

## 最新接续（本节优先于历史记录）

- 基线 b708b5e；本轮 DSH 原0.2.0 → CI51a873c的0.3.0三阶段实际升级/重启恢复通过，详见 docs/upgrade-testing.md。测试源码 tests/dsh-upgrade-smoke.cjs、tests/helpers/dsh-client-source.cjs；所有写入均在新建合成仓库。
- 证据 F:/Codex/work/gitviz-product/dsh-upgrade-030/result-{old,upgraded,restarted}.json、同阶段截图及 served-client-verification.json。浏览器使用隔离VSCode Integrated Browser，DSH_HOME 为 scratch/home。CLI plugin add 保持bundle唯一，逐文件包SHA、实际客户端资源、新版hook失败重启后同一记录续交、parent/tree/backup/clean全部核对。服务重启是操作完成后停止自己的Node进程再启动；同一浏览器标签页保留，未声称跨关闭浏览器保存sessionStorage。
- 首次页面遇到延迟出现的模型设置弹窗，测试等待后选择“稍后配置”；服务日志尚未输出启动URL时增加有界等待，复用同一新服务重试，没有因观察超时另开服务。实际截图已查看。客户端返回值是原始client.js加source-map注释，helper已独立在当前真实页面通过。
- DSH1540及VSCode7132已退出，3087/9235无监听；所有本机测试会话结束。VSCode CloseMainWindow没有成功退出，改用实际File→Exit正常关闭。没有日常配置、模型凭据或真实仓库写入。
- CI 37286170167（b708b5e）已终态：Linux/macOS成功，Windows111685481052失败。日志 delivery-ci-b708b5e-windows-failure.log：安全写锁断言通过，finally的taskkill /PID 8172 /T /F退出128，明示两个进程已不存在。本批 tests/git-process.test.cjs 的 cleanupKnownFixture 仅在Windows128且Git及两个已知hook PID均不存在、心跳停止时接受；仍有活进程或其他错误继续失败，生产执行器不变。
- Git 2.55.0真实进程4/4、人工注入“真实清理后128”通过；负注入“清理前128”按预期拒绝活Git，延后清理完成后再次确认hook PID消失。lint、前端build通过。故障注入preload脚本在F盘scratch，不打包进入生产。
- 本轮提交/push后跟踪新CI；下一产品验收是桌面旧0.2.0免安装 → 0.3.0NSIS的数据衔接及实际安装程序写入恢复，而不是重复DSH升级。当前生产偶发不确定清理问题仍保守保留，不把测试finally修正等同生产修复。

## 权威验证来源

- 已推送的生产代码提交 51a873c；42753af 仅接续文档。CI https://github.com/fisHarly0/gitviz/actions/runs/37283842186 三系统全部成功，已核对各 job 完成状态。
- Windows job 111677938796：Node/真实 Git/DSH/大历史、插件完整性/重复打包、Rust check/test、NSIS、实际安装程序 WebView 浏览/同版本重装/卸载全部通过。
- Linux job 111677938508、macOS job 111677938864：静态/真实 Git/Rust/原生构建全部成功，不宣称对应原生 UI 已验收。
- 三平台最终下载目录 F:/Codex/work/gitviz-product/delivery-ci-{linux,macos,windows}-51a873c；manifest 源提交/dirty=false/0.3.0/全部 SHA/文件大小、插件内容和 Unix tar 内 755 权限已核对。三个系统的 VSIX 和 DSH tarball SHA 一致。
- Windows 安装证据 delivery-ci-install-51a873c：JSON 与原生截图已查看，首次安装、同版本重装、正常关闭、卸载及 WebView/合成仓库保留均通过。跨版本桌面升级未测试。
- 公开可审查记录 docs/releases/0.3.0-validation.json，对应源提交 51a873c；本地验证汇总 delivery-ci-51a873c-verification.json。没有正式 GitHub Release/商店/npm 发布。

## 本轮 VS Code 升级

新增 tests/vscode-upgrade-smoke.cjs、scripts/test-vscode-upgrade.ps1、docs/upgrade-testing.md。使用 artifacts/gitviz-0.2.0.vsix 原旧包，更新到 CI 的 0.3.0；全新隔离 profile/extensions，VS Code 1.131.0。

实际 UI 打开旧版地图并浏览，正常退出后安装新版；核对实际激活版本、全部包代码/资源哈希及 manifest 原字段、批量20配置保留、HEAD/refs/index字节/工作文件不变。新版经真实确认触发 hook 失败，记录检查点；正常退出重启，核对记录原样，移除测试hook后从UI继续，检查备份、父关系、tree、clean及同一记录两次尝试完成。失败记录在新版创建，不冒充旧版日志迁移。

- 首套实测 vscode-upgrade-030/result-{old,upgraded,restarted}.json 全通过；截图已查看。
- 最终可复用 PowerShell 驱动在含空格的新目录 `F:/Codex/work/gitviz-product/vscode upgrade verified/` 三阶段全部通过；日志 vscode-upgrade-verified.log。第一次新配置复验在 VS Code 冷启动引导尚未结束时取命令面板超时，测试驱动改为等待实际可用命令面板后重测通过，不修改产品。
- VS Code 安装时会重排 package.json 并追加 __metadata；只对 manifest 排除这一安装元数据后比较 JSON，其他每个包文件严格按字节 SHA 校验。
- CLI脚本恢复自身临时环境变量，正常退出自己的 VS Code；9235 已无监听。所有本机执行会话已结束，没有活跃远程CI或自建测试应用。
- 本轮 lint 与前端 build 通过；仅新增测试/文档，没有生产功能改动。完成后提交/push本轮文件，跟踪新增CI运行，不重复旧的大历史/原生地图精修。

## 仍需明确保留的问题

上一 run 37282528185（0d314f4）Windows 的超时测试：hook父子进程已死但清理结果不确定，保护锁拒绝继续。日志 delivery-ci-windows-tests-failure.log。51a873c 保留 cleanupError 并在测试首个失败处诊断，不放宽未知状态写保护。当前 CI 未复现，且系统 Git 2.49.0 的15次重复、官方digest核对后MinGit 2.55.0.windows.5的10次重复均通过，但未确认根因或宣称修复。

本机 Rust 25/25、NSIS及本机安装检查已在前批完成（旧会话80835/45036等均结束）。这些记录不能替代未做的场景。

## 下一步顺序

1. DSH 升级本轮已完成；真实入口与旧证据保留，后续继续桌面数据衔接。独立 Chromium 曾被自动审批拒绝，后续原生宿主测试仍用允许的集成浏览器。
2. 桌面原0.2.0免安装版到0.3.0NSIS的数据衔接；不存在旧0.2.0NSIS可冒充跨版本安装器升级。
3. P1 多宿主同时操作的原生完整流程及偶发清理问题，P2首次使用与缺Git恢复；其他平台UI需强证据后才声明支持。
4. 逐项审查公开产品清单，准备最终支持平台、版本和产物，不能用P3工程项通过替代完整产品完成。

测试/日志 F:/Codex/work/gitviz-product，缓存 F:/dev/cache；只在合成仓库写入。不会自动发布外部商店或正式Release。

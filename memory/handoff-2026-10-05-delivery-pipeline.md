# 接续：工程交付与升级验收

项目 F:/gitviz，main；用户持续授权公开产品完善及提交/push。完整目标 spec/modules/public-product.md。P3 工程交付已关闭，P3 发布验证与 P1/P2 剩余项继续，不代表正式发行。

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

1. DSH 原 0.2.0 → CI 0.3.0 真正安装/重启/原生浏览写入与持久状态验收；用独立 DSH_HOME，禁止使用日常配置。既有 DSH可执行入口 C:/Users/Harly/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js，当前测试home F:/Codex/work/gitviz-dsh/home（旧记录），先核对再启动。独立 Chromium 曾被自动审批拒绝，继续使用 VS Code Integrated Browser。
2. 桌面原0.2.0免安装版到0.3.0NSIS的数据衔接；不存在旧0.2.0NSIS可冒充跨版本安装器升级。
3. P1 多宿主同时操作的原生完整流程及偶发清理问题，P2首次使用与缺Git恢复；其他平台UI需强证据后才声明支持。
4. 逐项审查公开产品清单，准备最终支持平台、版本和产物，不能用P3工程项通过替代完整产品完成。

测试/日志 F:/Codex/work/gitviz-product，缓存 F:/dev/cache；只在合成仓库写入。不会自动发布外部商店或正式Release。

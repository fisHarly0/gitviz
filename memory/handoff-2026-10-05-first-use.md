# 首次使用与 Git 启动恢复交接

项目 `F:/gitviz`，main，基线 `5b8e6b5`。用户授权持续完善至公开产品交付并提交推送；完整目标保持未完成。当前只推进 P2 首次使用，不改变 Git 写入契约、权限或系统 PATH。

## 实现

- `RepoLoader` 增加路径表单与 Enter 打开，失败保留路径；首屏、GitHub 输入与主要错误、预览/实际 HEAD、编辑/导出文案中文化。
- `CommitDetail` 文件选择改为原生按钮，支持键盘。`EditorPanel` 补提交说明标签及状态/错误语义。`ModeStatusBar` 无 HEAD 时不误称游离状态。
- `GitReadError` 提供 Git 版本、目录、PATH 和重启指引，保留详细错误。Node `git-process.cjs` 保留 GIT_START/cause，补 VS Code git.path / DSH 服务重启说明；未改变超时或停止进程逻辑。
- `VersionTree` 初始错误不再同时声称正在加载；无仓库时不再显示工作区干净、位置一致或历史已加载。
- 增加三个 `tests/first-use-*-smoke.cjs`；已有桌面编辑/关闭/恢复脚本只同步中文定位。README 添加首次使用入口，并修正已过时的 NSIS 未完成状态；说明见 `docs/first-use.md`。

## 验证

本批 lint、前端 25/25、Git 进程 5/5（包括真实缺少程序、超时 hook 子进程及未知停止状态）、三端构建与两插件内容检查通过。无 Rust 源码变更，不重复 Rust 检查。上批 `5b8e6b5` 的 CI `37293801905` 三系统全部成功，该产物不包含本批改动。

所有证据在 `F:/Codex/work/gitviz-product/`，合成仓库和隔离 profile；没有在用户项目验证写入，也没有修改全局 PATH。

| 入口 | 实测 | 证据 |
|---|---|---|
| 原生桌面 | 进程 PATH 缺少 Git，提示、只读重试、正常关闭后恢复；路径修正、空仓库、键盘选文件、预览/返回、fork/编辑/拒绝过期保存/取消/提交身份与 clean；最终两阶段正常关闭 | `first-use-native-final/result.json`、截图及 `first-use-native-final.log` |
| 实装 VSIX | 无效 git.path 的原生提示包含操作指引；修正独立 settings 并执行 Reload Window 后地图显示真实 HEAD；Git 未改写 | `first-use-vscode/result.json`、`run.log`、截图 |
| 实装 DSH | 服务进程无 Git，真实面板显示原因；恢复 PATH、重启服务后读取历史；无仓库不声称 clean；HEAD/refs/status 不变 | `first-use-dsh/result-{missing,restored}.json`、`test-missing-final-unique.log`、`test-restored-final.log` |

DSH 实际服务的客户端与安装文件核对，最终 client SHA256 `917876767ce1f12096661f5019748d5059b50a9cf9fe98e7ca311f99cb73e4f5`，rev `8219f20f5e9f`。同版本覆盖原 tgz 路径后 pnpm 曾复用旧代码，实际 UI 断言捕获；改为独立文件名重新安装后 SHA 与当前构建一致、两阶段通过。另一次早期脚本失败来自 VS Code 退出中的浏览器窗口，换独立 profile 后通过；这些失败日志保留，不当作产品通过证据。

VS Code 的 Git 故障与恢复验证早于最后一处共享“未打开仓库”文案修正；最后状态修正在 DSH 实装验证，两种插件已重新打包并通过完整性检查。VS Code 原生通知文字断言通过，但截图的 toast 文字未完整展开，不宣称整条通知均在截图中可见。桌面原生文件夹选择对话框本批未自动操作。

## 本机产物

`F:/Codex/work/gitviz-product/first-use-packages/`。均为本批工作树构建、版本 0.3.0，未正式发行，不能冒充基线干净提交产物：

| 文件 | SHA256 |
|---|---|
| gitviz.exe | `1d4045a9257e6f7b3c3f347b5b2eb8880bb5841639342edafd88d32114a99985` |
| gitviz-0.3.0.vsix | `bc41100291da1a01e5b4802161a63893f59aa451650017b4cf4df47db60b724b` |
| fisharly-gitviz-dsh-0.3.0.tgz | `15b3ad695781f752e7b553c5830736b177a2bfd27f3e2721eaa735d66713b502` |

`fisharly-gitviz-dsh-0.3.0-first-use-final.tgz` 是相同内容的独立安装路径。最终 desktop build 日志 `first-use-desktop-final-build.log`。

## 复现入口与边界

桌面脚本要求 `GITVIZ_FIRST_USE_ROOT` 指向尚不存在的绝对测试目录、`GITVIZ_DESKTOP_EXECUTABLE` 指向当前 exe、`PLAYWRIGHT_CORE_PATH` 指向已安装 playwright-core。脚本自己生成仓库，使用 WebView2 CDP 9348 并按 WM_CLOSE 正常关闭；不要连用户日常桌面实例。

VS Code 脚本要求独立 profile/扩展目录、实装 VSIX、CDP 9235，`GITVIZ_FIRST_USE_PLUGIN_ROOT/fixture.json` 含测试 repo 与有效 git 程序路径，settings.git.path 先设为不存在的程序。DSH 脚本要求独立 `DSH_HOME`、实装 tgz、3087 回环服务、VS Code Integrated Browser 的 CDP 9235，以及 `GITVIZ_FIRST_USE_DSH_ROOT` / `GITVIZ_FIRST_USE_DSH_HOME`；根下 fixture.json 含 repo，`server-{missing,restored}.log` 提供对应服务启动地址。分别执行脚本的 `missing` / `restored` 参数。服务地址可能携带凭据，禁止把原始启动日志粘入公开文档。

桌面正常关闭已实测；VS Code File > Exit 后未可靠结束，测试宿主收尾不视为正常关闭验收。独立服务/浏览器在批次收尾按 PID 和配置路径核对后停止，3087/9235/9348 无监听；隔离配置和测试证据保留。

## 下一步

1. P2：GitHub 在线成功/错误入口、剩余中文/读屏与键盘确认审查，按缺口修复；不要重复已有 10000 条地图或升级测试。
2. 对照公开产品清单最终审查 P1 两项，将历史证据与当前实现核对；保留外部 Git 非原子隔离和无法确认进程停止时保守锁定的边界。
3. P3：支持平台声明、最终干净提交对应包的安装/升级/三端冒烟与发布说明。Linux/macOS 原生 UI 未验收，不能用 CI 构建成功代替。

完整 P1/P2/P3 未关闭，不因当前批次通过而宣布公开产品完成。

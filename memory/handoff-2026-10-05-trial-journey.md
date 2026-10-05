# 查看存档、开试验与返回

项目 `F:/gitviz`，main，基线 `9809730`，开始时工作树干净。用户认可产品评价后授权继续，当前推进 P2 连贯操作体验。没有扩大 Git 写入种类、Tauri 权限或 DSH HTTP 权限。

## 行为

- VS Code / DSH：预览时可直接“与实际位置比较”（HEAD → 选中提交，不含未提交修改）；“返回实际位置”退出比较、清除搜索/局部范围并定位 HEAD，无 Git 切换。文件变化标明比较基准。
- 试验创建结果显示目录及宿主对应打开行为。VS Code 保留原窗口、另开试验窗口；桌面 / DSH 当前地图打开试验，顶部按本次会话记录返回上个仓库。返回不撤销、更改或删除试验内容。
- 桌面：成功打开后才更新路径记录；普通更换仓库清除记录。`if-` 试验分支在当前节点可直接编辑，原有保存契约和未保存导航保护保留。
- DSH：返回路径来自成功打开试验前的仓库，忽略请求任意指定路径；失败不弹出记录。选择仓库取消现在显式返回 cancelled，保留地图选择/比较/返回状态。仓库改变时重置节点/比较/查询，避免同一提交存在于两个 worktree 时沿用旧预览。DSH 对话目录不变。
- 返回记录不跨重载/重启持久化。使用说明在 `docs/first-use.md`，README 已更新。

修改：`src/App.jsx`/CSS、`DesktopActions`/CSS、`CommitDetail`、共享 `VersionTree`/CSS、`extensions/dsh/client.jsx`；两个新原生测试脚本和本批文档。没有修改 Rust 或 VS Code 宿主后端。

## 证据

测试入口 `tests/trial-journey-smoke.cjs`。设置绝对 `GITVIZ_TRIAL_ROOT` 和 `GITVIZ_TEST_HOST=desktop|vscode|dsh`，先以 `init` 参数创建新目录及 25 提交仓库，再在隔离宿主连接 CDP 后无参数运行。`PLAYWRIGHT_CORE_PATH` 使用已安装的 playwright-core；默认桌面 9348、插件 9235，可用 `GITVIZ_CDP_URL` 覆盖。VS Code 需实装 VSIX，独立 settings 的 `window.dialogStyle=custom`、`gitviz.worktreeDirectory` 在 scratch 内；DSH 服务 3087，独立插件配置的 worktreeDirectory 同样位于 scratch。只用原生 WebView2 与 VS Code Integrated Browser，未启动独立 Chromium。

证据根 `F:/Codex/work/gitviz-product/`：

| 入口 | 结果目录与验证 |
|---|---|
| Windows 桌面 | `trial-desktop-final/result.json`、`run.log`；路径打开、预览/返回、取消、从旧节点创建试验、打开、当前位置直接进入/取消编辑、编辑时返回禁用、保留试验修改后返回原仓库 |
| 实装 VSIX | `trial-vscode-final/result.json`、`run-ready.log`；一键 HEAD 比较、打开原生 Diff、退出比较、取消、新窗口打开实际试验路径、切回原窗口 |
| 实装 DSH | `trial-dsh/result.json`、`run-ready.log`；一键比较/逐行 Diff、预览返回、取消、试验打开/返回，原仓库和试验未提交内容均保留 |

三端核对原仓库 HEAD、index tree、工作文件及状态不变，试验 HEAD 对应选中提交。创建分支/试验会按预期增加引用，不能说 refs 全程不变；只有取消阶段核对 refs 不变。测试仓库都在 scratch，没有在用户项目测试写入。

`tests/trial-return-failure-smoke.cjs` 另在 DSH 暂时移开合成原仓库 `.git`，验证返回失败保留试验位置与返回路径；恢复元数据后重试成功，原进度保留。`finally` 恢复元数据，收尾核对 `.git` 存在且临时路径不存在。证据 `trial-dsh/return-failure-result.json` / `return-failure-ready.log`；初轮断言早于 busy 状态退出而失败，脚本改为等待可交互状态，生产代码未因此修改。

DSH 实际客户端与安装文件对应，SHA256 `3927a0a6e6cc95584cd90f50778584111e80ec35ec53b69ce69c8b002d94e4c5`，rev `e6c10f825bc7`，见 `trial-dsh/client-identity.json`。桌面 960×600 与 DSH 392px 检查无页面横向溢出，截图保留；窄窗口需要滚动看地图和详情，未声称二者始终同屏。共两轮视觉检查。

前端 25/25、DSH 后端 10/10、lint、三端构建、插件内容检查通过。最后桌面构建日志 `trial-desktop-build-final.log`。无 Rust 修改，不重复 Rust 检查。基线 9809730 / CI 37297161250 三系统均成功，不代表本批 CI 结果。

早期脚本失败保留在 `trial-desktop`、`trial-vscode` 和 `trial-dsh/run.log`：桌面测试促使补齐当前试验分支编辑入口并等待正确节点就绪；VS Code 缺少 custom dialog 配置及 CDP 启动等待；DSH 冷启动宿主遮罩。最终上述结果才是通过证据。

收尾：桌面按 WM_CLOSE 正常关闭；DSH 与 VS Code 只停止已核对 PID/隔离 profile 的测试进程，不作为宿主正常关闭验收。3087/9235/9348 监听已释放，独立 DSH 测试 profile 的临时 worktreeDirectory 配置恢复，测试仓库/截图/日志保留。

## 开发产物

目录 `F:/Codex/work/gitviz-product/trial-journey-packages/`，0.3.0 工作树构建，不是正式 Release：

| 文件 | SHA256 |
|---|---|
| gitviz.exe | `380cdce483ef40e743363c441989d5314ae5bdb538dbd64cd054454d23c0b255` |
| gitviz-0.3.0.vsix | `ea5087f075f531c0e859530c31f5b1693f4ec7f583126469f3c1915307b73e1f` |
| fisharly-gitviz-dsh-0.3.0.tgz | `b37133a1d698d1c60ee333d1dd3b1b98ad1b2fb197cbf1c1be1ff5d037d2c3c7` |

## 未完成与下一步

真实陌生用户试用仍未发生，自动化不证明用户能独立理解流程。完整 P2 的 GitHub 在线错误/可访问性、P1 最终证据核对、P3 最终发行包与平台验收继续保留。游戏化仍以位置、试验路线和返回反馈为主，本批没有引入拖动节点改写 Git 历史或宣称提供通用撤销。

下一批按当前完整验收清单推进，优先收齐首次使用与可访问性缺口；不要重复已有 10000 条历史、升级、三端并发检查。公开产品目标仍未完成。

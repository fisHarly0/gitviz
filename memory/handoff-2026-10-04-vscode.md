# Gitviz 交互式版本树 / VS Code 0.1.0 交接

## 工作区与授权

- `F:/gitviz`，`main`，基准 `f5a0511`；Git 根目录一致，无新增工作树。
- 用户要求可视化像树一样直观，增加游戏化节点选择、变换与回滚；目标为 VS Code 与 DeepSeek Harness。已确认先实施 VS Code，再适配 DSH。
- 接手时上批 README/TUTORIAL、前端及 Rust diff 修复均未提交，全部保留。本批没有提交、推送或发布；没有更改用户日常编辑器配置。
- 开场使用场景 B。实现前已写决策和模块规格。

## 新增 / 修改范围

- `src/version-tree/`：React 共用 UI，纯 DAG 布局、全部父边、稳定主路径、节点选择/键盘/搜索/缩放/拖动、比较与详情、主题和窄面板布局。
- `extensions/vscode/`：Extension Host、Git CLI 服务、限定方法消息协议、受信任工作区、原生 Diff 文档、真实命名与恢复确认。
- `vite.extension.config.js`、`scripts/package-extension.mjs`：离线 Webview 包与 VSIX。根 package scripts、eslint 与 gitignore 接入；未引入新的生产依赖。
- `tests/version-tree.test.js`、`tests/git-service.test.cjs`、`tests/vscode-smoke.cjs`。
- PRODUCT、设计记录、README 新插件入口、`docs/dsh-adapter.md`、模块规格、当前状态与本交接。

## 操作语义

- 点击存档、选择比较仅只读。节点变化对应真实 Git 新提交/分支变化，不提供拖拽改写历史。
- “建分支”不切换。“从这里试一版”创建隔离 worktree，默认 F:/Codex/worktrees，有设置可改目录；用户自行点击在新窗口打开。
- 切换用 Git switch 同步文件，不覆盖忽略文件。有工作区或编辑器未保存内容时阻止写入切换。
- “恢复此存档”确认文件清单后，创建 gitviz/backup-* 分支，restore 目标树，再 commit。HEAD/分支快照二次核对，内部写操作互斥。拒绝 dirty、in-progress、sparse、submodule 及忽略文件覆盖。
- 尊重 Git hooks/签名；提交失败保留文件和暂存更改，并给出备份引用。成功后核对新提交树，hook 改变内容时不宣称恢复完全一致。
- 不对外部进程同时修改仓库提供完整事务隔离，仍以 Git 锁与操作前检查为界。
- 历史默认 300、最大 2000。旧 HEAD 不在窗口时，在数量上限内单独保留并标注；缺失父历史为短虚线且预留间隔，避免假连接。

## 验证与证据

| 检查 | 结果 |
|---|---|
| npm run lint | 通过 |
| npm test | 既有 GitHub 4 条及布局用例通过 |
| npm run build | 旧桌面/浏览器前端构建通过，147 模块 |
| npm run extension:test | 18/18 后新增一条布局边界用例；最终分模块 Git 13/13、布局 6/6，共 19 条 |
| npm run extension:package | Webview 约 210 KB JS + 12 KB CSS，生成 artifacts/gitviz-0.1.0.vsix |
| VSIX 安装 | VS Code CLI 在独立 F 盘 profile/extensions 目录安装成功 |
| 真 Extension Host | 1.131.0：激活、命令、快照、Webview、真实分支/worktree、Git blob 原生 Diff；host-result.json |
| 实装插件 UI | 11 条通过；真实节点/比较/搜索/缩放/merge、原生命名、worktree、取消恢复、确认恢复、dirty 阻止、原生 Diff；installed-ui-result.json |
| 截断旧 HEAD | 真 VS Code：20 节点上限、HEAD 保留、当前节点可聚焦、定位按钮启用、原生上下键选点；old-head-result.json |
| 主题 / 布局 | 深色、浅色、1440/800 外窗及 440 外窗（392 内容宽）；无页面横向溢出，地图内部滚动 |
| 设计 detector | []，未发现机械规则问题 |

所有临时脚本、日志和合成仓库在 `F:/Codex/work/gitviz-plugin` / `F:/Codex/work/gitviz-tests`。真实 UI 用已有 Playwright 安装连接 Code Electron CDP。`--extensionTestsPath` 模式会拒绝确认弹窗，因此恢复流程另外在正常实装 VSIX 中验证，没有 mock 确认。截图 `.impeccable/review/` 为本地证据，不纳入 Git。

真实写入只发生在合成仓库，保留了用例结果以便复查。旧 Tauri 后端本轮未更改，未重复 Rust 构建。

## 未完成 / 未验证

- DSH 插件未实现；共享 bridge 与接入方案已记录。DSH 还需要宿主主题/文案/权限适配及实际运行验证。
- 节点拖拽 merge/rebase/cherry-pick、游戏关卡教程尚未实现；本批节点动作是创建分支、切换、独立试验与保留历史的恢复。
- Marketplace 未发布；许可证仍沿用仓库现状，未凭空添加法律授权。
- macOS/Linux、远程 SSH/容器、高对比主题/屏幕阅读器、2000 节点交互性能未实测。
- 仓库选择对话框/多仓库路径与未保存编辑器阻止已实现，完整端到端矩阵未逐一自动化；无仓库/空仓库由服务用例与组件状态实现覆盖。
- 用户仓库上未经用户试用；不把本机合成用例当作所有环境保证。

## 接续

优先根据用户实际仓库反馈调整节点密度与交互；下一平台从 `docs/dsh-adapter.md` 入手。提交前区分接手前 README/TUTORIAL 原稿与本轮修改。最终测试进程/端口清理情况由收尾记录追加。

## 最终收尾

- 界面审查首次 fix：截断历史丢失旧 HEAD。修复并新增真实 Git/真实键盘回归后，原问题复核 resolved、disposition ship；详见本地 `.impeccable/review/verdict.md`。
- 最终 VSIX 82,523 字节，SHA256 `9D6F31437CE814ED69B41D7127F2155EBE58FEF4B34F6798EDF720E855D362EE`。附带 React、React DOM、Scheduler 的版本与许可证全文。
- 测试 VS Code 进程已关闭，9235 不再监听；未启动常驻开发服务。F 盘测试配置与合成仓库保留为验证证据。
- 原始构建产物始终位于 `F:/gitviz/artifacts/`；聊天 outputs 内仅复制最终 VSIX、预览和使用说明作为交付附件。

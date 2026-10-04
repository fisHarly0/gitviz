# 模块规格索引

| 模块 | 代码范围 | 当前状态 |
|---|---|---|
| 交互式版本树 / VS Code 插件 | `src/version-tree/`、`extensions/vscode/` | 本轮新增；验收见 [version-tree.md](version-tree.md) |
| DSH 版本树插件 | `extensions/dsh/` | 已在 DSH 0.2.0-rc.2 Web 验证；见 [dsh-plugin.md](dsh-plugin.md) |
| 仓库浏览 | `src-tauri/src/commands/repo.rs`、`src/adapters/tauriAdapter.js` | 已实现 |
| Preview/Edit 状态机 | `src/state/`、`src/components/` | 已实现 |
| 分支写入 | `src-tauri/src/commands/branch.rs` | 已实现 |
| if 分支导出 | `src-tauri/src/commands/export.rs` | 已实现 |
| GitHub 只读 | `src/adapters/githubAdapter.js` | 已实现 |
| 启动与仓库加载 | `src/App.jsx`、`src/components/RepoLoader.jsx`、`src/state/useSession.js` | 桌面/浏览器分流、加载防重、会话重置、只读提示；见 `docs/decisions/2026-10-04-startup-and-loading.md` |
| 安装包 | Tauri bundle 配置 | 待处理，MSI/NSIS 工具链存在阻塞 |

新增能力前先在 `docs/decisions/` 记录 command、权限、回滚和验收条件。

# 模块规格索引

| 模块 | 代码范围 | 当前状态 |
|---|---|---|
| 仓库浏览 | `src-tauri/src/commands/repo.rs`、`src/adapters/tauriAdapter.js` | 已实现 |
| Preview/Edit 状态机 | `src/state/`、`src/components/` | 已实现 |
| 分支写入 | `src-tauri/src/commands/branch.rs` | 已实现 |
| if 分支导出 | `src-tauri/src/commands/export.rs` | 已实现 |
| GitHub 只读 | `src/adapters/githubAdapter.js` | 已实现 |
| 安装包 | Tauri bundle 配置 | 待处理，MSI/NSIS 工具链存在阻塞 |

新增能力前先在 `docs/decisions/` 记录 command、权限、回滚和验收条件。

# 共有操作确认对齐交接

`F:/gitviz`，main，基线 `aa0d098`，开始时工作树干净。本批按持续公开交付授权实现并验证共有操作的预览/确认，提交推送源码，不发布正式版本。完整清单仍为 `spec/modules/public-product.md`，六项顶层要求均未关闭。

## 实现与范围

- Node GitService 增加 `prepareAction`、`executePrepared` 和 `confirmationText`。预览只读，字段对齐桌面的 expected/target/branchName/directory/files/impact。列出完整 OID、差异数量、前 8 个文件及剩余数量；建分支/worktree 明确原目录不变，恢复说明备份与保留历史。
- 计划绑定仓库和全部历史引用 revision，准备前后与执行 guard 内核对，五分钟一次有效。引用变化（包括目标分支被推进）、跨仓库或重放拒绝，未开始写入的拒绝不产生日志。使用既有互斥与跨宿主锁，不改变记录格式和 Git 操作。
- VS Code 建分支/worktree 输入后补最终原生确认，全部五个共有写动作共用预览。DSH 服务端保存计划，前端只能提交一次性票据；两端使用同一份影响文字。
- 桌面沿用结构化预览，修正 operations.rs 的历史版本采集顺序：先记录 revision，再读预览并核对，避免预览生成期间移动目标时绑定到新 revision。新增真实 Git 测试同时覆盖准备与确认期间的目标推进。桌面 UI 未改，不把原有原生界面测试算作本轮新增实测。

## 验证

- 原 22 项 Node Git/布局回归通过；新增 4 项真实 Git 预览测试通过：完整字段与取消只读、确认期间目标分支推进后拒绝、过期/跨仓库拒绝、读取初始历史时发生目标更新拒绝。`npm run dsh:test` 6/6，覆盖票据绑定、过期、取消、目标推进、真实恢复/worktree/分支切换与继续检查点。
- `cargo test --release --lib commands::operations::tests -- --test-threads=1`：10/10，约 212 秒，含桌面新增的目标 revision 前后核对及 Rust/Node 双向恢复回归。日志 `F:/Codex/work/gitviz-product/confirmation-rust-test-release.log`。最初启动 debug 编译后确认既有缓存为 release，主动停止该编译并改用 release；debug 日志不作为测试结论。
- `cargo check --release` 通过，日志 `F:/Codex/work/gitviz-product/confirmation-rust-check.log`；无新的权限、依赖或 IPC 接口。
- lint、主前端构建、VSIX 与 DSH tarball 构建通过。Impeccable detector 对 DSH client 运行一次，结果 `[]`。两种确认截图已查看，DSH 960×700 对话框边界通过。
- 测试包 `F:/Codex/work/gitviz-product/confirmation-packages/`。VS Code 安装到独立 `confirmation-extensions`，使用已有隔离 `gitviz-plugin/installed-profile`；DSH 在既有隔离 `gitviz-dsh/home` 用 CLI 安装新路径 tarball 并重启。已核对已安装 VS Code git-service 与 DSH host 的源码哈希一致。
- `tests/vscode-recovery-smoke.cjs`、`tests/dsh-recovery-smoke.cjs` 实装流程均通过；本批新增建分支/worktree 最终确认与取消、完整目标与文件、外部推进目标分支拒绝，保留后续失败恢复、取消、外部改文件拒绝、tree/parent/backup 和 DSH 重载持久检查。没有伪造 Git IPC/扩展消息，只有 UI 操作和合成仓库外部变更。
- 结果：`F:/Codex/work/gitviz-product/confirmation-vscode-result.json`、`confirmation-dsh-result.json`；截图同名前缀 `.png`；日志 `confirmation-vscode-smoke.log`、`confirmation-dsh-smoke.log`。恢复报告沿用 `recovery-vscode-result.json`、`recovery-dsh-result.json`，内容为本轮新 fixture。DSH 预期三次 API 400 已核对错误文本，渲染错误 0。

## 接续

已关闭自己启动的 Code / DSH 进程树（启动 PID 28844 / 20096），9235 / 3087 无测试监听。用户日常配置和服务未改。插件测试包仍为开发中的 0.2.0 元数据，不覆盖原 artifacts，不代表正式发行。本批不重新打包桌面 exe，使用新版源码需重新构建；Rust 测试直接调用本轮生产实现。

下一批：Git 超时和派生进程终止、跨宿主剩余预检差异（Node 切换对稀疏检出的边界仍需核对）、执行期间外部 Git 竞态和插件宿主退出。当前 revision 检查不能锁住外部 Git 工具，不能将确认期间的拒绝测试扩张为所有执行竞态已解决。随后继续地图折叠/概览、首次使用与发行 CI/安装升级验证。

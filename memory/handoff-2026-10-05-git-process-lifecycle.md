# Git 进程生命周期交接

工作区 `F:/gitviz`，main，基线 `30a47a0`。本批沿用公开交付持续授权及提交推送约定，处理 Git CLI 超时、输出上限和未知清理状态。完整六项交付要求继续开放，见 `spec/modules/public-product.md`。

## 代码与边界

- 新增 Node `extensions/vscode/git-process.cjs` 和 Rust `src-tauri/src/commands/git_process.rs`，让命令退出、输出关闭和进程清理都受时限约束。Windows 使用 SystemRoot 下 taskkill 的精确 PID 和 /T /F；Unix 使用独立进程组，不新增依赖。主进程退出后不再按旧 Windows PID 清理，避免误用已回收的 PID。
- Node GitService 与流式搜索统一接入；普通命令 30 秒、提交 120 秒，Buffer 保留。桌面 history 30 秒、operations 120 秒。stdout/stderr 各 32 MiB 上限，超限报错，不能静默截断为成功；流式历史字段另限大小。
- 不能确认停止时标记当前仓库/服务状态不确定，禁止继续写入，保留已取得的跨宿主操作锁。普通已完成清理的超时保留文件/index/备份及失败记录，符合检查点时可以继续提交。没有自动 reset、删除用户文件或重试。
- VSIX 明确包含新模块，DSH 构建复制同一模块；测试可用 `GITVIZ_GIT_SERVICE_DIR` 指向解包目录，验证实际产物。无 UI、权限、Git 记录格式变更。
- 用户说明见 `docs/git-processes.md`。不覆盖主动脱离树且关闭继承输出的后台任务、强制退出宿主或 hook 外部副作用；桌面旧 gix 读取/导出不是此执行器的覆盖范围。只读异常仅锁住当前服务，不创建持久写入锁。

## 本轮验证

- `npm run extension:test`：30/30；`npm test`：20/20；lint 通过。日志 `F:/Codex/work/gitviz-product/process-node-test.log`、`process-frontend-test.log`。
- `npm run history:test`：4/4，含真实 2000/5000/10000 条分页/搜索/布局、引用变化、浅历史和边界关系；`npm run dsh:test`：6/6，真实恢复/切换/worktree 和失败续交通过。两项结果为本轮工具输出。
- `cargo test --release --lib -- --test-threads=1`：13/13，199.28 秒，含既有写入/互操作/大历史及新增 hook 超时、未知状态锁；随后单测 `exited_git_parent_with_open_pipe_returns_bounded_uncertainty`：1/1。日志 `process-rust-test.log`、`process-rust-pipe-test.log`。
- Rust / Node 真实 pre-commit 创建 Node 父子进程，检测超时后 PID 消失和心跳停止，HEAD/index/文件仍正确；Node 通过真实恢复记录继续提交。Node 注入终止失败验证锁保留，Rust 通过状态注入验证同一路径。
- 悬挂管道 fixture 使用真实 Git shell alias 启动持有 stdout 的后台子进程；Rust 和 Node 都在限定时间返回不确定，测试随后按自己记录的 PID 清理。最初尝试 Node 父进程退出 fixture 没有在 Windows 上重现继承管道，因此测试失败；改用真实 Git alias 后通过。该初始失败不是通过证据。
- VSIX 和 DSH package 构建通过，产物在 `F:/Codex/work/gitviz-product/process-packages/`，不覆盖历史 artifacts。解包后三个共享模块逐字节匹配源码；对每种包分别运行 `tests/git-process.test.cjs`，各 4/4。日志 `process-vsix-packaged-test.log`、`process-dsh-packaged-test.log`；解包验证脚本 `F:/Codex/work/gitviz-product/check-process-packages.cjs`。
- `cargo check --release` 通过，日志 `process-rust-check.log`。额外 `git_output_limit_rejects_partial_history_instead_of_returning_success` 测试 1/1，日志 `process-rust-output-test.log`；本批 Rust 共 15 个不同用例通过（13 项整组 + 2 项逐次新增）。
- `npm run desktop:build -- --ci` 通过，含主前端构建及 release exe，日志 `process-desktop-build.log`。新 exe 已复制到上述 process-packages 目录，和 VSIX/tarball 一起记录 `SHA256SUMS.txt`。这些仍使用开发中 0.2.0 元数据，不是正式 Release，也没有完成干净安装/升级验证。

测试 fixture 位于 `F:/Codex/work/gitviz-product/process-tests`；缓存 Cargo/npm 在 `F:/dev/cache/`。本批测试和构建进程均已结束，未启动 VS Code、DSH 或原生桌面 UI，未修改日常配置；前批的实装 UI 验证不能算作本次新进程实现的原生 UI 证据。Windows 进程机制已运行，Linux/macOS 尚未验证。

## 后续

下一批核对并补齐跨宿主写入预检差异，尤其稀疏检出、子模块和运行中的 Git 操作；随后验证执行期间外部 Git 并发变化与插件宿主退出。P2 连续提交折叠、分支/里程碑概览、选中节点探索仍为明确未完成需求，接着做首次使用和发行 CI/安装升级。不得把本批进程边界验证扩张为公开产品已交付。

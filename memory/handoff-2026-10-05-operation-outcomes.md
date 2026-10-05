# Git 执行结果核对交接

工作区 `F:/gitviz`，main，基线 `9b299db`，开始时干净。按完整公开交付目标继续写入可靠性；不缩减地图、首次使用和正式发行要求。

## 实现

- Node/Rust 新增位置、检出及提交结果检查，不能仅凭 Git exit 0 报成功。分支创建核对引用与原位置；切换/fork 核对分支、目标和干净状态；worktree 核对新目录并核对原位置；提交核对单一父提交、检查点 tree、原分支、工作区和备份。
- 两端切换计划保存确认目标 OID，执行再次比较。Rust Plan 增加内部 target，无 IPC 字段变更。
- 恢复在 commit 前重新检查暂存 tree 等于目标，核对 HEAD/分支、文件与检查点；Node 此时忽略本操作创建备份引起的历史 revision 变化，但独立核对原 HEAD/分支和备份。桌面编辑另核对文件字节及暂存变更路径，只允许原编辑文件。
- 混入的 restore 检查点被取消，失败记录不得从该检查点继续提交；正常 hook 失败仍保留合法检查点。后验失败保留真实文件/引用/worktree/已产生提交，记录实际 HEAD/分支，不自动 reset 或重试。
- Gitviz 锁无法禁止外部 Git；这些前后检查不构成原子事务，不承诺最后一次检查后状态不再变化。说明见 `docs/operation-outcomes.md`。

## 验证

- Node 五组新增情形：reference-transaction 在建立备份时改 HEAD，post-checkout 改 HEAD，post-commit 换成同 tree/错误 parent 的提交，worktree hook 改文件，post-index-change 混入暂存文件。Rust 新增相同五类及桌面编辑混入暂存区，共六组。
- 所有最终 fixture 均使用真实 hooks 和真实 Git 子进程，无伪造 Git 返回值。Node 暂存混入测试最初用 command 包装在 restore 返回后发出真实 git add；已换为 post-index-change hook，并单独通过后纳入全量。Windows 实测，其他平台未运行。
- DSH 新增真实 HTTP 确认后 hook 改位置案例：返回 400 和结果不一致说明，保留文件并记录实际位置。已有失败续交和正常动作回归保留。
- lint、主前端构建通过；VSIX/DSH 包构建通过，最终增加备份后 guard 后已重新构建并解包核对，共享模块逐字节一致且 require 成功。产物及 SHA-256 在 `F:/Codex/work/gitviz-product/outcome-packages`；检查脚本 `check-outcome-packages.cjs` 位于同级工作目录。
- `npm run extension:test` 39/39，最终新增备份 hook 用例与 6 个恢复用例定向回归 7/7；共 40 个不同用例。日志 `outcome-node-test.log`、`outcome-node-final-restore.log`。
- `cargo test --release --lib -- --test-threads=1` 24/24，319.71 秒；新增 `outcome_restore_rechecks_position_after_backup_reference_hook` 1/1，共 25 个不同用例。包含大历史、超时、预检、正常写入和双向续交。日志 `outcome-rust-test.log`、`outcome-rust-backup-test.log`；`cargo check --release` 通过，日志 `outcome-rust-check.log`。
- `npm run dsh:test` 8/8，日志 `outcome-dsh-test.log`。所有日志位于 `F:/Codex/work/gitviz-product/`。

测试仓库位于 `F:/Codex/work/gitviz-product/outcome-tests`，缓存在 F 盘；未修改真实用户仓库，测试及构建均已结束。三端 UI 未改；源码检查确认插件和桌面动作在错误后请求刷新，但本批没有启动原生 UI，不将源码检查当作实装证据。本批不重建桌面 exe；此前 process-packages exe 不含最近两批源码更新，插件包仍为开发中 0.2.0 元数据。

## 接续

下一模块处理 VS Code/DSH 宿主关闭/停用时的执行与未完成记录，之后做三端原生异常操作验收，再进入地图折叠/概览/节点探索。完整清单仍在 `spec/modules/public-product.md`，六项顶层要求未全部关闭；正式 CI、版本/许可证/安装升级与发布验收继续保留。

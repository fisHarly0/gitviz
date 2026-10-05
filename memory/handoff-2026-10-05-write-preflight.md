# 三端写入预检交接

`F:/gitviz`，main，基线 `08240a1`，开始时工作树干净。本批继续公开产品交付，按既有授权提交推送；六项顶层交付要求仍未全部达成。

## 实现

- Node 新增共享 `fullCheckout` 与 `checkRestore`。切换、恢复、继续提交与桌面一样要求完整检出；缺失 sparse 配置使用默认 false，读取错误不能吞掉。恢复的子模块、忽略文件碰撞和身份检查在预览与执行复用。
- 三端拒绝会隐藏工作文件变化的 index skip-worktree/assume-unchanged 标记，不自动清标记。分支引用创建和独立 worktree 仍可从稀疏仓库使用，不修改原工作目录。
- Node 状态、桌面 guard 和地图 dirty 状态显式 `--ignore-submodules=none`，不被 submodule.ignore/diff.ignoreSubmodules 的显示配置掩盖。继续提交的暂存区比较也覆盖 ignore 配置。
- Git 状态标记按每个 worktree 的 Git 路径访问，访问错误向上报告；ENOENT 才作为不存在。六种标记均在预览和执行重新检查。
- 无新增依赖、权限、IPC 或 UI。用户说明见 `docs/write-preflight.md`，决策 `docs/decisions/2026-10-05-write-preflight.md`。

## 验证证据

- `npm run extension:test`：34/34；随后新增身份错误预览测试单独 1/1，本批共 35 个不同用例通过。日志 `F:/Codex/work/gitviz-product/preflight-node-test.log`、`preflight-identity-test.log`。
- Node 新用例使用真实 sparse-checkout set、真实本地子模块、真实 linked worktree；确认后改变 sparse/index/子模块/标记状态，执行拒绝且保留 HEAD/分支/文件/index，操作记录不增加。原忽略文件保护测试增加预览断言；身份错误拒绝验证未创建备份。
- `cargo test --release --lib -- --test-threads=1`：19/19，260.40 秒；`cargo check --release` 通过。日志 `preflight-rust-test.log`、`preflight-rust-check.log`。包含四类新增预检用例、无效 boolean、既有大历史/超时/跨宿主续交/真实写入回归。
- `npm run dsh:test`：7/7，日志 `preflight-dsh-test.log`。新增真实 HTTP 用例验证服务端在预览拒绝 sparse，也拒绝确认后才改成 sparse 的旧票据；保留原取消、过期、恢复/worktree/切换与继续提交回归。
- lint 与主前端构建通过。VSIX/DSH 构建通过，产物及 SHA-256：`F:/Codex/work/gitviz-product/preflight-packages/`。解包后三个共享模块与测试源码逐字节一致，实际 require 成功，脚本 `F:/Codex/work/gitviz-product/check-preflight-packages.cjs`。

测试仓库在 `F:/Codex/work/gitviz-product/preflight-tests`，npm/Cargo 缓存使用 F 盘。测试和构建均已结束。本批未启动原生桌面、VS Code 或 DSH UI；没有用旧 UI 结果声称新预检已实装验证。本批不重建桌面 exe，之前 process-packages 的 exe 不含本次预检改动；运行新桌面行为需从当前源码构建。插件仍用开发中 0.2.0 元数据，不是正式发布或升级验收。

## 剩余工作

Git 自身的权限、锁、hook 和 worktree 占用失败仍需三端原生流程验收；外部 Git 在执行期间并发修改、插件宿主退出与其他平台验证仍未关闭。子模块递归检出和独立历史不作为本批新增支持，整树恢复继续明确拒绝 gitlink。后续先处理执行期间的状态变化，再完成地图折叠/概览、首次使用、CI 和正式安装升级交付。保持 `spec/modules/public-product.md` 全目标。

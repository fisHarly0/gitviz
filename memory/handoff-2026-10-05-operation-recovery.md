# 三端操作记录与失败恢复交接

工作区 `F:/gitviz`，分支 main，基线 `1b93101`。目标仍为完整公开产品交付；本批推进操作记录与继续提交，不关闭上层 P1/P2/P3。决策：`docs/decisions/2026-10-05-operation-recovery.md`。

## 实现

- Rust `commands/journal.rs` 与 Node `operation-journal.cjs` 使用同一 JSON v1：每个 worktree 的实际 Git 目录下保存记录，检查链接/记录大小/仓库归属，临时文件原子替换，按 ID 分页。保存动作移除编辑正文，仅存参数、起点、备份/输出、检查点、结果、错误和次数。
- 全部 Gitviz 写动作在执行前建立记录，沿用同一 worktree 锁。保存/恢复在 commit 前存 index tree；失败保留现场。取消预览不创建记录或增加次数。
- `resumeCommit` 仅接受 failed 的 saveEdit/restore 检查点；预览与执行分别验证 HEAD/分支、备份、index tree、工作文件、未跟踪文件和进行中的 Git 操作。票据绑定检查点，最终提交 tree 也核对。用户身份、hooks、signing 保留。
- 共享 `OperationHistory` 接入三端。桌面内嵌编辑未结束时禁止恢复；VS Code 继续前后检查未保存编辑器并用原生确认；DSH 在面板确认、取消时撤销票据。running/损坏记录仅展示，不自动清锁或重试。
- DSH 实机发现宿主 React 不提供 `useEffectEvent`，已改为 `useRef` 与 effect 更新读取函数；避免开发项目 React 版本掩盖宿主兼容性。
- 两套打包脚本支持 `GITVIZ_ARTIFACTS_DIR`，测试包独立存放，不覆盖旧 0.2.0 产物。

## 验证与复现

证据目录 `F:/Codex/work/gitviz-product`。所有写入仅针对新建合成仓库，没有改用户日常 DSH/VS Code 配置，也没有模型调用。

- `npm test`：14/14；`npm run extension:test`：22/22；`npm run dsh:test`：5/5。新增 hook 失败、重复继续拒绝、预览只读、HEAD/index/worktree/untracked/检查点变化拒绝、分页、关联 worktree 隔离、坏记录与元数据 junction。
- `cargo test --manifest-path src-tauri/Cargo.toml --release --locked --offline -j 1 commands::operations::tests -- --test-threads=1`：9/9，`recovery-rust-test.log`。新增 Node 失败→Rust 继续、Rust 编辑失败→Node 继续，核对 tree、parent、backup、身份以及记录不含编辑正文。
- 三端构建、lint、VSIX 与 DSH tarball 构建通过。设计 detector 对本批三个 React 入口运行一次，结果 `[]`；兼容性修正没有改变视觉布局。
- 桌面：`tests/desktop-recovery-smoke.cjs`；真实 Tauri/WebView2。恢复失败、取消不改 index/次数、预览后外部修改拒绝、记录持久、编辑失败保留内容与编辑中禁止续交、继续后的身份/tree/parent、960×600 确认框。结果 `recovery-desktop-result.json`，日志 `recovery-desktop-smoke.log`。复现见 `docs/desktop-testing.md`。
- VS Code：最终测试 VSIX 安装至独立 `recovery-vscode-final-extensions`，`tests/vscode-recovery-smoke.cjs` 通过。原生确认、取消、外部变化拒绝、真实提交及备份；结果 `recovery-vscode-result.json`。
- DSH：独立 profile 安装最终 tarball 并重启服务；通过 VS Code Integrated Browser 执行 `tests/dsh-recovery-smoke.cjs`，包含重新加载页面后的记录读取。结果 `recovery-dsh-result.json`；除两次故意失败且核对响应正文的 API 400 外，页面/控制台无错误。复现见 `docs/host-testing.md`。
- 曾同时运行多个宿主导致系统内存不足，相关失败不计通过；后续采用串行验证。UI 脚本另修复了 Webview 挂载等待、新仓库加载等待、DSH 初次配置引导和预期失败响应的断言，不放宽 Git 结果检查。
- DSH 同路径同版本的 tarball 即使强制安装仍可能使用旧文件；改用独立文件名安装，并核对安装后 client 哈希与构建产物相同。未将测试包当作正式发行。
- 最后核对发现桌面续交成功后仍显示原操作的失败横幅。成功续交现在重置存档操作面板的临时反馈，原错误保留在持久记录中；取消或被拒绝时保留失败提示。桌面脚本加入对应断言。
- 最终兼容 Hook 修正后重新构建桌面（`recovery-desktop-build-final.log`），桌面恢复脚本再次全部通过；VS Code 也重新安装至新的隔离扩展目录并复测通过。本批启动的桌面、VS Code、DSH 进程已关闭，9248/9235/3087 无测试服务监听。测试文件保留在 F 盘；原 `artifacts/` 旧包未覆盖。

## 剩余目标和接续

1. P1：应用关闭时保护内存编辑；三端确认信息/影响文件预览一致性；异常退出及长时间 hook/子进程处理。当前崩溃 running/残留锁只提示手动检查。
2. P2：连续提交折叠、分支/里程碑概览、节点邻域探索；首次使用和语言/错误/无 Git/离线体验。
3. P3：CI、正式版本一致性、许可证/贡献/安全说明、安装包与校验和；干净环境安装/升级及真实复杂历史验收。

上层清单仍在 `spec/modules/public-product.md`。当前源码与旧 0.2.0 包有差异，不能把旧包的安装验证等同于新功能发布。Gitviz 锁不控制外部编辑器或 Git 进程；恢复记录不是文件备份。

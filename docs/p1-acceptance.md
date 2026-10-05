# Git 操作与编辑恢复验收

2026-10-05 至 06 日，核对基线 `601c477` 和本批链接路径测试。**P1 两项在当前 Windows 桌面、VS Code、DSH 三端范围内通过。** 这不关闭 P2 首次使用和 P3 最终发行验收，也不宣称其他系统原生界面已验证。

本次重新读取后端、adapter、会话与编辑代码，检查下表的测试断言和实际结果文件，而非只采信旧交接的“通过”摘要。历史 UI 结果未重新运行；当前生产写入后端相对原生失败批次 `7ed3601` 未变化（Rust 此后仅增加测试），会话 reducer 未变化。后续 UI 的试验打开/返回另有三端实测。旧证据的文件名、SHA256 和检查结果摘录保存于 [证据索引](p1-evidence.json)，原始结果位于其中声明的本机 scratch。

## Git 操作一致性

| 要求 | 当前实现和可复现检查 | 已检查的实际证据 |
|---|---|---|
| 桌面同步 HEAD/index/worktree | `operations.rs` 的 SwitchBranch/ForkEdit 使用 Git switch，执行后核对位置和 clean；Rust `switch_fork_and_save_sync_real_files_index_and_user_identity` | `actions-editor-result.json` 中 fork、switch、index、身份断言；三端 `native-failure-*.json` 的占用分支拒绝 |
| 创建分支不切换 | Rust CreateBranch、Node createBranch 仅增加引用并核对原位置；两端有真实 Git 测试 | `actions-ui-result.json` 的 branchCreationPreservesFiles；VS Code/DSH 确认结果和后端测试 |
| 独立 worktree 保留原目录 | 使用 Git worktree add；允许原目录有未提交进度，检查新目录及原位置 | `trial-{desktop-final,vscode-final,dsh}/result.json` 的 originalFilesAndIndexPreserved、trialStartsAtSelection、returnPreservesTrial；旧 actions-ui 独立目录检查 |
| 恢复保留历史与备份 | 建立备份引用、restore 到目标 tree、创建单父新提交；提交后核对 parent/tree/backup/clean | 三份 native-failure 的 recoveredParentTreeBackup；`native-concurrency-030/result.json` 每轮唯一新提交及备份正确；Node/Rust 恢复测试 |
| 统一预览、明确确认、取消不写 | 桌面 prepare/execute/cancel；VS Code 原生确认；DSH 一次性确认；取消与迟到确认不得派发操作 | `confirmation-{vscode,dsh}-result.json`、actions-ui、原生失败三端结果；VS Code 生命周期接缝测试和 DSH HTTP 测试 |
| 过期、仓库变化、目标移动拒绝 | 5 分钟一次性计划，绑定仓库/HEAD/分支/历史 revision；准备前后及执行再次校验 | Node prepared-actions/target-update、Rust preview/revision 测试；原生确认 movedTargetRejected、actions-ui stalePreviewRejectedAndRetryWorks |
| 脏工作区及其他 Git 操作拒绝 | 干净检查含未跟踪、子模块真实状态、进行中操作；拒绝隐藏 index 标记/稀疏检出；切换不覆盖 ignored 文件 | Node/Rust preflight 测试；原生三端 lateIndexLockRejected、indexAndFilesPreserved、真实 refs ACL 拒绝 |
| 同仓库三端并发与刷新一致 | 跨宿主排他文件锁、执行前重复检查、结果记录与独立日志刷新 | native-concurrency 三轮轮换桌面/VS Code/DSH 写入者，竞争者与旧预览拒绝后状态/日志不变；同 Git revision 的失败记录可由桌面续交 |

## 编辑与恢复

| 要求 | 当前实现和可复现检查 | 已检查的实际证据 |
|---|---|---|
| 路径边界、链接、元数据保护 | edit_path 限制相对路径、保留名、每级链接/Windows reparse point、HEAD 中的普通文件；同目录临时文件替换避免硬链接旁路 | 既有 Rust unsafe_paths 硬链接和越界测试；本批真实 junction 拒绝后原 HEAD/index/目标字节/日志不变。Unix symlink 分支交由本批 CI 验证，尚不作为本机通过证据 |
| 用户身份/hooks/signing 生效 | 通过真实 Git commit，不自行制造提交；继续操作保留同一配置 | Rust/Node 身份和真实 hook 拒绝测试；上批四项真实 SSH 签名、密钥不可读和修正后续交，均运行 git verify-commit |
| 编辑缓存、仓库切换不串写 | 打开编辑时冻结源 HEAD；导航/关闭保护；adapter 绑定 repo，后端再次核对仓库；换仓库重置 session | session-state 四项测试；actions-editor 的 externalHeadDoesNotRebaseEditor、staleSaveRejectedWithoutLosingBuffer、unsavedNavigationBlocked；trial-desktop-final 编辑中返回保护 |
| 失败不自动丢内容 | 原文件替换失败保留临时文件并提示路径；commit 失败保留工作文件/index/checkpoint；不自动 reset/stash | actions-ui hookFailurePreservesData；close-result 的 failedSavePreservesFilesIndexRecordAndDraft；native-failure 的 hook/锁/ACL 流程；签名失败测试 |
| 有明确继续或人工处理路径 | 仅 failed 且有效 checkpoint 可续交；检查原 HEAD/分支、暂存 tree、工作文件、备份、不混入新工作 | recovery-vscode/dsh、原生失败的取消/续交、Rust/Node 双向读记录继续；改变 index/工作文件/HEAD/确认内容时拒绝 |
| 操作记录可检查 | worktree 独立 JSON v1、分页、损坏条目可见；不保存编辑正文；记录真实最终位置和尝试次数 | Node journal 分页/linked worktree/损坏/链接保护，Rust/Node 双向恢复；三端原生同编号记录刷新，DSH 页面重载与宿主重启持久化 |
| 正常关闭与执行中退出 | 桌面保护草稿和运行中的操作；插件已确认操作由独立 worker 执行，重开后查记录 | close-tests/close-result 全部场景；lifecycle-native 的 VS Code 退出；DSH 原生管理页停用后 worker 完成、锁释放和记录可见 |
| 超时和结果异常可识别 | Git 输出/时间有界；清理未确认时保留锁；提交后核对实际 parent/tree/位置，异常不假报成功 | Node/Rust 真实 hook 子进程超时、输出上限、未知清理保护；真实 reference/post-checkout/post-commit/post-index hooks 改现场测试 |

源码入口：[Rust 操作与测试](../src-tauri/src/commands/operations.rs)、[共享 GitService](../extensions/vscode/git-service.cjs)、[Node Git 测试](../tests/git-service.test.cjs)、[会话保护](../src/state/session-state.js)、[三端原生失败](native-failure-testing.md)、[原生并发](native-concurrency-testing.md)。当前 Tauri invoke 列表不再导出旧 write_file/add_and_commit/仅改 HEAD 的 checkout 写入口，capabilities 未新增通用 shell 或文件写权限。

## 验证范围与剩余边界

- a576797 的 [三系统 CI](https://github.com/fisHarly0/gitviz/actions/runs/37334503429) 全部通过：真实 Git、进程、生命周期、前端与构建；Windows 另含 NSIS 安装冒烟。601c477 增加真实签名测试后的 [CI37335956148](https://github.com/fisHarly0/gitviz/actions/runs/37335956148) 三系统也全部成功，补齐签名用例的跨平台后端证据。
- 本批 `linked_edit_paths` Windows junction 测试和 `cargo check --release --locked --all-targets` 通过，日志为 scratch 下 `p1-audit-links-final.log`、`p1-audit-check.log`。只改测试，无需重跑所有原生 UI。Unix 目录/文件 symlink 分支已加入，不声称 Windows 执行过它。
- P1 通过指上述约束中的可观察行为。外部 Git 不遵守 Gitviz 锁，最后一次检查后仍存在外部竞态；hooks 的外部副作用不回滚。无法确认进程停止时，操作维持未完成并暂停继续写入。早期 Windows 偶发清理异常未确认根因，不能写成已经彻底修复。
- 强杀整个进程树、断电、硬件故障不保证任务完成或未保存缓冲持久化；应按 [进程异常](git-processes.md) 与 [操作恢复](operation-recovery.md) 检查现场。记录不是工作文件备份。
- 签名实测为 SSH；GPG/硬件密钥/交互式解锁不冒充已验证。Linux/macOS 原生 UI、全面可访问性、真实陌生用户试用、最终版本干净安装/升级与三端最终包冒烟仍在 P2/P3。

下一步从未关闭的 P2/P3 继续，最终发行检查必须使用指定干净提交生成的同批产物，而不是沿用旧包。

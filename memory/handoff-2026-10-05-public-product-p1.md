# 公开产品完善 · 桌面写入首批

用户目标持续有效：“目标公开产品的交付标准，开始完善”。完整范围见 spec/modules/public-product.md，目标仍 active，不得把本批完成当作全目标完成。工作区 F:/gitviz，基线 main / decad8e，接手干净。

## 已实现

- Rust operations.rs 接管桌面写入；branch.rs 只保留查询。旧 create_branch/checkout/write_file/add_and_commit IPC 全部移除，不能绕过新保护直接写文件。
- prepare/execute/cancel：随机一次性票据、5 分钟有效、仓库/HEAD/branch/revision 绑定；状态互斥及 Gitviz 锁文件。切换/fork/save/restore 要求干净状态，branch/worktree 保留原目录改动。
- Git CLI 真实切换与提交，用户身份/hooks/signing 生效；2 MB 文本限制、路径/元数据/链接拒绝、临时文件替换保留文件权限并隔离硬链接。提交失败保留工作文件与暂存内容。
- 后端 restore 备份后创建新提交，worktree 独立目录已实现并通过测试；两项尚未接入桌面动作 UI，继续完成。
- 新的原生 dialog 显示仓库、HEAD、影响和文件；Esc/取消不执行。编辑期间禁止换库/地图选点；丢弃未保存内容需确认。session 使用后端真实 HEAD，成功保存显示新提交。

## 证据

F:/Codex/work/gitviz-product：
- check.log：cargo check release offline 通过；getrandom 0.3.4 为缓存中已有依赖，新增为直接依赖并更新 lock，无其他依赖升级。
- operations-test.log：6 个 Rust 集成用例通过，44.84 秒（单线程）；分支/文件/index/身份、只读 preview、跨库/重放/过期、dirty/陈旧/合并状态、路径/硬链接、worktree/restore、失败 hook。
- desktop-build.log：release exe 构建成功。CARGO_HOME=F:/dev/cache/cargo，jobs=1，RUST_MIN_STACK=8388608，RAYON_NUM_THREADS=2。
- ui-result.json：实际 Tauri release + WebView2，合成 drop 事件打开真实 Git 测试仓库，随后所有确认与编辑通过界面，真实 IPC/Rust 未模拟。取消、fork 真同步、Monaco 编辑、丢弃确认、保存取消、保存身份/干净 index、切回主线文件同步全部通过，无 pageerror。
- dialog-result.json：WebView 模拟 960×600，确认框不越界、焦点保留、Esc 取消。confirm.png / confirm-960.png / switched.png 已查看；后者等待地图实际位置刷新后重新截取。
- npm run lint / npm run build / npm test（10/10）通过。前端 detector 一次，原桌面调色与旧组件 advisory；新 dialog 已改用现有变量。没有重复全面扫描。

原生文件选择框和真实多设备尚未自动化验证。Monaco 本轮在可联网环境成功加载，不代表离线可用。

## 必须继续的缺口

1. 操作日志/可检查的恢复记录、失败后的继续提交/恢复入口（现有保留数据+说明，但仍需用户用 Git 处理）。完成 desktop restore/worktree UI，并校验三端一致契约。
2. 外部 Git 改变 HEAD 后，地图刷新与 App session 实际位置需统一；当前 stale 校验会阻止写入，但可能需重开仓库才能恢复。应用关闭的未保存内容保护也待补齐。
3. Windows junction/symlink 实测、身份缺失与签名失败、稀疏/子模块/忽略文件更多契约覆盖。路径检查不应宣称抵抗同权限恶意进程持续替换父目录的全部竞态；Unix 子进程树超时清理仍需完善。
4. 按清单继续地图折叠/概览、语言和首次使用、Monaco 离线资源、CI、许可/贡献说明与正式发布产物。未发布新版本，artifacts/ 的 0.2.0 仍是旧包。

本轮未修改 VS Code / DSH 源码，未在真实用户仓库运行写入测试。使用的测试程序已关闭；临时文件与日志保留 F 盘。不得丢失此完整目标或把 README 的开发版说明当成正式发布证明。

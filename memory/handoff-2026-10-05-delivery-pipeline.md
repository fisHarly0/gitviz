# 接续：工程交付流水线

F:/gitviz，main，基线 51cb87e。用户持续授权公开产品完善及提交/push。本批 P3 工程交付，其他模块边界不变。

新增三系统 CI、版本同步/检查、插件完整性/重复打包测试、产物 manifest/校验和、根 MIT 许可证、贡献/安全反馈/交付说明。统一源码开发版本 0.3.0；Tauri 工具缓存改用项目 target，NSIS 在 Windows CI 中构建。Rust CI 大历史 fixture 缺失或不足时明确失败。

本机已通过版本检查、lint、25 项前端测试、两个插件前端构建、包内容检查、2 项交付测试（版本错配/缺失 worker 拒绝/两次打包字节一致）。`cargo check --locked --all-targets` 已通过，随后同一个执行会话 80835 正在编译并运行 Rust 测试，日志 `F:/Codex/work/gitviz-product/delivery-cargo-{check,test}.log`。不能将工作流文件存在算作 CI 验收通过。

已推送 53a6be4 和 95d6d9c。首轮工作流因 job env 使用 runner context 被解析器拒绝，已改为启动步骤写 GITHUB_ENV。实际运行 `37281063992`（95d6d9c）：三系统 Node/真实 Git/DSH/大历史均通过；Linux/macOS 包校验及 Rust 测试通过，正在构建桌面。Windows 在包校验失败：GNU tar 将绝对盘符当远程主机；已修正为 cwd + basename，并用本机 GNU tar 1.35 跑完整包校验及重复打包测试通过。日志 `delivery-ci-windows-failure.log`。修正连同安装包许可证/发布说明草稿先保存，等待当前 Linux/macOS job 结束并保存缓存再推送复验，避免取消仍在编译的有效任务。

CI 地址：https://github.com/fisHarly0/gitviz/actions/runs/37281063992 。Linux job 111669019958，Windows job 111669020077（已失败终态），macOS job 111669020274。后续先检查这些具体任务和本机 80835，不因等待时间较长重启构建。旧 CI 结束后推送后续修正并跟踪新 run；新版 Windows 原生包尚未得到证据。

继续核实：上述 run 已完成，Linux/macOS 全流程成功并上传产物；Linux 下载后所有文件及 manifest SHA、插件内容校验通过，source=95d6d9c、dirty=false。本机 80835 已结束 exit0，Rust 25/25（包含全部大历史fixture）。后续修正 e969ffe 已提交；补充 Unix tar 包以保留可执行权限，再一起推送。当前本机 NSIS 构建执行会话 45036，日志 `delivery-nsis-build.log`，工具缓存 `src-tauri/target/.tauri/` 在 F 盘。此行取代上方仍活跃的旧状态。

暂存与产物：F:/Codex/work/gitviz-product/delivery-*；npm/Cargo 缓存均在 F:/dev/cache。正式 Release、安装升级验收、签名公证、三端原生最终包验收、P1 多宿主并发和 P2 首次使用仍未完成。完整公开产品目标保持 active。

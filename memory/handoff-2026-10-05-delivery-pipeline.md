# 接续：工程交付流水线

项目 F:/gitviz，main；用户持续授权公开产品完善及提交/push。当前只推进 P3 工程交付，完整目标以 spec/modules/public-product.md 为准。

## 已完成与证据

- 53a6be4、95d6d9c、e969ffe、0d314f4 已推送：三系统 CI、统一 0.3.0 开发版、插件包完整性/确定性测试、manifest/SHA、MIT/贡献/安全/发行草稿、Windows GNU tar 盘符修正、Unix tar 保留执行权限。
- CI 37282528185（0d314f4）：Linux/macOS 全流程成功；Windows 在真实 Git 超时恢复测试失败。此前 37281063992 的 Linux 产物已下载并校验全部 SHA、manifest 和插件内容。
- 本机 cargo check --locked --all-targets、cargo test --locked --lib 25/25 已通过（旧会话 80835 已结束），消费真实 2000/5000/10000 历史 fixture。
- 本机 NSIS 构建完成（旧会话 45036 已结束），产物 src-tauri/target/release/bundle/nsis/gitviz_0.3.0_x64-setup.exe；工具缓存 target/.tauri 在 F 盘。
- scripts/test-windows-installer.ps1 + tests/installed-desktop-smoke.mjs：本机首次安装、原生 WebView 读取真实合成仓库、选择节点不改变 Git、正常关闭、同版本重装保留 WebView 数据、卸载保留仓库均通过。证据 F:/Codex/work/gitviz-product/installer-smoke-first/installer-result.json 与截图。自建安装已卸载，CDP 9347 监听和卸载注册均已清理。

## 本轮修改与尚未解决

Windows CI 超时测试中 hook 父子进程已死、心跳停止，继续提交却被 processUncertain 阻止。原始日志 delivery-ci-windows-tests-failure.log；错误原因此前被吞掉。git-process.cjs 现在保留 cleanupError，测试在首个错误处检查 GIT_TIMEOUT 并输出底层清理错误，不修改未知状态下的写锁保护。当前只增加诊断，尚未证明根因或修复。

本机 PowerShell 10 次、Git Bash 5 次针对性重复均通过；45 项插件测试、10 项 DSH 测试、lint、前端 build 通过。另从官方 release 下载并核对 digest 的 MinGit 2.55.0.windows.5，在 F:/Codex/work/gitviz-product/git-ci-version 使用，同版本再测 10 次通过。原系统 Git 2.49.0 不变；所有本机测试会话均已结束。不能据此排除偶发清理失败。

Windows 安装冒烟新增至 CI，在新的 runner 临时路径测试安装/原生 UI/同版本重装/卸载，单独上传 JSON/PNG 证据；本机通过不等于 CI runner 通过。这些诊断与安装检查已提交推送 51a873c，新 run 37283842186（https://github.com/fisHarly0/gitviz/actions/runs/37283842186）。不要重试到绿色就宣称偶发问题已修复；若再次失败读取明确 cleanupError，保留安全边界。

## 最新运行状态（此节为接续入口）

- 51a873c 的 Linux job 111677938508 已全流程成功；下载目录 delivery-ci-linux-51a873c，源码/dirty=false/SHA/包内容及原生执行权限已验证。
- Windows job 111677938796 已通过前端、45 项插件/DSH/历史测试与包校验，当前 Rust check/test 仍在运行；后面是 NSIS 和新安装冒烟。上一轮偶发超时清理问题没有复现，但未找到根因，不得标为已修复。
- macOS job 111677938864 已通过检查和 Rust 测试，当前 Desktop build 仍在运行。按具体 job 查状态，不因构建等待较久重开流水线。
- 上一提交 0d314f4 的 Linux/macOS 产物已下载至 delivery-ci-{linux,macos}-tar；全部 SHA/manifest/插件内容与 tar 内 755 权限通过，结果 delivery-ci-tar-check.json。
- 本机没有活跃测试会话或自建应用；只有上述远程 CI 仍在运行。文档记录提交使用 [skip ci]，避免取消正在进行的有效构建。

## 下一步

1. 读取新 CI 具体 run/jobs；Windows 必须通过真实 Git、Rust、NSIS 和安装检查；Linux/macOS 也须全流程成功。任何失败按实际日志修复。
2. 下载最终三平台产物，验证源提交/dirty=false、版本、SHA 和 Unix tar 执行权限；Windows 安装证据单独核对。
3. 更新交付子项；跨版本升级、VS Code/DSH 最终包原生验收、多宿主并发、首次使用、Linux/macOS UI 与正式发行仍未完成，不提前关闭完整目标。

测试/日志 F:/Codex/work/gitviz-product；缓存 F:/dev/cache。只在合成仓库写入。没有正式 Release、商店或 npm 发布。

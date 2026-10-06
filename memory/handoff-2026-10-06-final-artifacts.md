# 固定产物复验（2026-10-06）

用户确认截止北京时间 2026-10-07 00:00，即 2026-10-06 16:00 UTC。完整公开产品目标尚未完成。

应用源码固定为 `486dae37b082c8fdfe5025aa1c8bbe73e7259b98`，CI `37484149175` 三系统全部通过。本批仅修改验收脚本和文档。证据根目录 `F:/Codex/work/gitviz-product/release-486dae3/`，精确文件身份见 `docs/releases/0.3.0-validation-486dae3.json`；旧清单仍对应旧批次。

## 已验证

- 三个干净 manifest、全部 SHA-256、插件跨平台字节一致性和 Unix 执行权限通过。Windows 干净 runner 首次安装、重装、真实浏览、关闭、卸载及安装字节校验通过。
- 当前实际 VS Code **1.140.0**：原 0.2.0 → 本批 VSIX 全流程通过，包含安装文件、设置、Git 状态、hook 失败和正常重启后继续提交；证据 `vscode-upgrade-current-host/`。
- DSH **0.2.0-rc.2 Web**：原 0.2.0 → 本批 tarball 全流程通过，安装文件及实际提供的客户端代码一致，启用状态/同标签页仓库保留，服务重启后继续提交的 parent/tree/backup/clean 正确；证据 `dsh-upgrade/`。测试服务和承载页面已关闭，无模型调用。
- CI Windows raw exe：全新 profile 阻断外部 HTTP(S)，五类 worker、许可文本、取消/保存、身份/parent/clean 和重启读取/关闭复验通过；证据 `offline-editor-close-diagnostic/`。不是操作系统层断网，不代表用户 hooks 无需网络。

## 桌面关闭驱动根因

`window-target/windows.txt` 证明 `.NET Process.MainWindowHandle` 选中同进程可见的 **Tao Thread Event Target**，真正的 **Tauri Window** 是另一个句柄。向正确窗口发 WM_CLOSE 后，同一未修改编辑器立即退出，见 `window-target/close-result.txt`。早期错误目标的超时不应直接归因为产品关闭回归。

helper 现在先验证 exe/PID，再要求恰好一个该 PID 的可见 `Tauri Window`；缺失/不唯一即失败，不回退到任意窗口。安装和升级驱动复用此路径。文件保存框仍限定同一 PID。

其他驱动修正：VS Code 等候命令就绪并用键盘执行，只读 Webview 查询容许启动导航的瞬时上下文切换；桌面等待真正的 Tauri 页面；导出测试对齐中文“正在打包…”文案。未删除 Git、包内容、备份或实际退出断言，未增加写入重试。此前失败目录全部保留。

## 未完成

最新桌面完整升级/关闭契约收尾状态以产物清单为准。P2 全面可访问性/陌生用户试用，P3 其他系统原生 UI、默认 AppData 迁移、签名/公证和正式发布继续保留。没有创建正式 Release 或发布商店/npm 包。

收尾复验：修正关闭目标后，`desktop-upgrade-final-verified/` 的旧版 2000 条历史与正常关闭通过；安装程序字节一致，但本机安装阶段未在时限内暴露 WebView，完整升级仍失败。`native-close-correct-window/` 已通过空白、未修改编辑器、草稿/重复关闭/键盘确认，导出场景启动时 WebView 提前关闭，剩余三场景不冒充通过。

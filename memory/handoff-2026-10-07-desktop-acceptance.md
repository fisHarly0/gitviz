# 桌面固定产物验收补完

工作区 `F:/gitviz`，分支 main，基线 `6493e9f`。公开产品目标继续；用户北京时间 2026-10-07 01:30 检查进展。P2/P3 未完成项保留。

## 本批改动

- `scripts/test-desktop-upgrade.ps1`：按阶段记录 stdout/stderr、PID、退出状态和启动耗时；等待按 60 秒预算控制，发现退出立即结束。
- `tests/desktop-close-smoke.cjs`：正常关闭必须原生退出码为 0、没有终止信号；崩溃不能冒充关闭成功。
- 同步固定产物清单、升级说明、发布说明和当前状态。没有修改生产代码或重新打包。

## 实测结果

使用固定源提交 `486dae37b082c8fdfe5025aa1c8bbe73e7259b98` / CI 37484149175 的原始 exe 和 NSIS。原始 exe SHA-256 `f65d0bdfbba42d10e86c55bb0f25f9bfb81dc369c2fb9efbd6e38aa430de16c6`。安装后 exe 仅有已知 Tauri `UNK -> NSS` 标记差异，其他字节一致。

1. `F:/Codex/work/gitviz-product/desktop-upgrade-20261007-confirmed/desktop-migration-result.json`：0.2.0 免安装 → 0.3.0 安装版 → 重启，完整通过。两版读取 2000 条真实合成提交，浏览不改仓库，偏好保留；真实 hook 失败后跨正常重启继续成功，检查父提交、tree、备份和清洁状态；卸载保留仓库与隔离 WebView 数据。
2. `F:/Codex/work/gitviz-product/desktop-close-20261007/close-result.json`：六组通过，无界面错误。覆盖干净启动、未改编辑器、内容/说明草稿及 960×600 键盘确认、导出原生保存框、已有 Git 确认与执行中的 hook、失败保存现场。六份原生日志均记录退出码 0，无终止信号。
3. 固定产物此前 VS Code 1.140.0 / DSH 0.2.0-rc.2 Web 升级和离线桌面编辑证据继续有效，见发行清单；本批未重复执行。

## 尚未解决的启动风险

首次补验在安装版启动时超时：`desktop-startup-20261007/startup-upgraded.json`，进程存活但只枚举到 Tao Thread Event Target，没有实际 Tauri Window。日志为空。随后同一安装文件在新旧 profile、PowerShell 启动和旧版→安装版→重启快速连续启动中均正常，证据 `desktop-profile-probe/`；最后完整升级通过。生产逻辑未改，不能声称定位或修复了间歇故障。

此前向 Tao 内部窗口误发关闭请求属于已经定位的测试问题，与本次真正未出现 Tauri Window 的启动超时分开记录。测试安装均已卸载，关闭套件进程均正常退出；合成仓库和证据保留。不代表默认 AppData 迁移、旧 NSIS 升级、其他系统原生 UI 或异常断电已验证。

## 接续

优先改善桌面地图可见空间、失败状态的可执行恢复入口，并在宽窄原生窗口验证。公开产品清单中的首次使用、全面可访问性、陌生用户试用、平台原生验收与正式发布仍需完成，启动风险继续追踪。验证与缓存保持 F 盘；项目沿用用户明确指定的现有 `F:/gitviz`。

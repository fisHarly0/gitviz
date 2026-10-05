# 桌面真实 Git 冒烟测试

测试针对当前源码构建的 Windows Tauri 程序。使用独立 WebView2 profile 和临时 Git 仓库，不要连接日常使用中的 Gitviz 窗口。测试只通过产品界面执行动作；Git 命令用于准备合成历史和核对实际结果。

## 准备

先运行 `npm run desktop:build -- --ci`。需要可用的 Git、WebView2 和已安装的 `playwright-core`；测试连接现有 WebView2，不下载或启动其他浏览器。

以下路径是示例，可替换为自己的绝对路径；测试目录保存合成仓库、截图和 JSON 结果。

```powershell
$env:GITVIZ_DESKTOP_TEST_ROOT='F:\Codex\work\gitviz-product'
$env:PLAYWRIGHT_CORE_PATH='F:\gitviz-work\browser-check\node_modules\playwright-core'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9248'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $env:GITVIZ_DESKTOP_TEST_ROOT 'desktop-profile'
$env:TEMP=$env:GITVIZ_DESKTOP_TEST_ROOT
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:GITVIZ_DESKTOP_TEST_ROOT | Out-Null
$testApp=Start-Process -FilePath '.\src-tauri\target\release\gitviz.exe' -WindowStyle Hidden -PassThru
node tests/desktop-actions-smoke.cjs
node tests/desktop-editor-smoke.cjs
node tests/desktop-recovery-smoke.cjs
Stop-Process -Id $testApp.Id
```

等待应用启动后运行脚本。`GITVIZ_CDP_URL` 可指定其他调试端口。每个脚本创建新的合成仓库；测试结束不删除目录，便于检查失败状态。

## 覆盖与限制

- `desktop-actions-smoke.cjs`：创建分支不切换、取消不写入、过期确认拒绝与刷新重试、恢复新提交与备份、dirty 原目录与独立 worktree、打开关联工作区、打开失败保留当前仓库、游离 HEAD、失败 hook 保留内容、小窗口表单与确认框。
- `desktop-editor-smoke.cjs`：fork 真正同步文件、未保存导航保护、外部 HEAD 变化时拒绝保存并保留编辑缓冲、取消与重新开始、真实提交身份/index、切回主线同步文件。
- `desktop-recovery-smoke.cjs`：恢复 hook 失败、操作记录与备份、取消不改 index/次数、确认后外部修改拒绝、继续提交的 tree/parent/身份、重开仓库记录持久、编辑缓冲保留和编辑中禁止续交、960×600 确认框。
- 不模拟 Tauri invoke，也不替换 Git 后端。打开仓库使用合成拖放事件；文件夹选择框尚未自动化验证。
- 小窗口通过 WebView 视口模拟；没有覆盖物理多设备、跨平台、离线 Monaco 或操作系统强制关闭。
- 这是开发验收入口，尚未接入 CI，不能据此宣称已完成正式发行安装与升级验收。

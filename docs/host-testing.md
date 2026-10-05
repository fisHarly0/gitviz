# 插件恢复冒烟测试

使用独立 VS Code 用户配置/扩展目录，以及独立 `DSH_HOME`。不要把测试连接到日常窗口；脚本会在合成仓库中安装失败 hook、执行恢复、修改文件并继续提交。两套宿主串行运行，避免在内存紧张时与 Rust 构建或原生桌面同时启动。

## 构建测试包

```powershell
$env:npm_config_cache='F:\dev\cache\npm'
$env:GITVIZ_ARTIFACTS_DIR='F:\Codex\work\gitviz-product\recovery-packages'
npm run extension:package
npm run dsh:package
```

`GITVIZ_ARTIFACTS_DIR` 可将开发测试包放到独立目录，避免覆盖 `artifacts/` 的旧版本。它不改变包内版本号，不等于正式发布。测试包必须重新安装并重启宿主；特别是 DSH 同路径同版本 tarball 可能仍引用缓存，请为每轮包使用不同文件名，并对比安装后的 `dist/client.js`、`git-service.cjs` 和 `operation-journal.cjs` 哈希。

## VS Code

1. 用 `code --user-data-dir <独立配置> --extensions-dir <独立扩展目录> --install-extension <测试 VSIX> --force` 安装。
2. 用 `tests/helpers/large-repo.cjs` 的 `largeRepo(25)` 创建新的合成仓库，保存 `{root, first, head}` 为 fixture JSON。`GITVIZ_LARGE_TEST_ROOT` 指定 F 盘测试目录。不要把真实仓库写进 fixture。
3. 用相同配置启动 VS Code，加 `--remote-debugging-port=9235`，打开 fixture 仓库，执行“Gitviz: 打开交互式版本树”。首次欢迎页需先完成或跳过；等待地图就绪。
4. 执行：

```powershell
$env:GITVIZ_DESKTOP_TEST_ROOT='F:\Codex\work\gitviz-product'
$env:GITVIZ_HOST_FIXTURE='F:\Codex\work\gitviz-product\recovery-host-fixture.json'
$env:PLAYWRIGHT_CORE_PATH='F:\gitviz-work\browser-check\node_modules\playwright-core'
node tests/vscode-recovery-smoke.cjs
```

覆盖已安装扩展、建分支/试验目录的最终确认与取消、完整仓库/起点/目标/文件信息、确认期间目标分支外部推进拒绝、真实原生恢复确认、确认后外部文件修改拒绝、继续提交及 tree/parent/backup 校验。脚本从命令面板打开版本树，通过 Webview DOM 操作界面，不伪造扩展消息或 Git 后端。每次重跑创建新 fixture 并重新打开窗口。

## DSH

在独立 `DSH_HOME` 中安装 tarball，重启 `dsh web --port 3087 --no-open`。使用上述隔离 VS Code 的 **Browser: Open Integrated Browser** 打开该服务的启动地址。启动地址含本机会话凭据，不要提交到仓库或打印到测试报告。

```powershell
# 沿用上面的 GITVIZ_DESKTOP_TEST_ROOT 和 PLAYWRIGHT_CORE_PATH
node tests/dsh-recovery-smoke.cjs
```

脚本自行生成新仓库并通过面板打开，覆盖建分支/试验目录的最终确认、取消、目标分支变化拒绝、960×700 确认框、失败恢复、外部文件修改拒绝、实际新提交和完整页面刷新后的记录持久；页面和控制台渲染错误都会导致失败。需要已启用的 Gitviz 插件，不进行模型调用。

两套脚本默认 CDP 9235，可通过 `GITVIZ_CDP_URL` 修改；DSH 页面默认使用 3087。结果 JSON 和截图保存在测试目录。结束后关闭本次测试宿主；不自动删除仓库，保留现场用于诊断。

# 安装与升级验证

当前 0.3.0 仍为开发构建；这些检查不代表已正式发布。源码、安装包和插件包必须区分，不能用源码测试替代已安装程序的行为。

## Windows 桌面

`scripts/test-windows-installer.ps1` 在全新测试目录安装 NSIS 包，运行真实 WebView，打开合成 Git 仓库并预览旧提交，然后正常关闭、同版本重装、再次启动和卸载。它检查 WebView 数据保留、仓库 HEAD/状态/引用不变、卸载注册和程序清理，并拒绝覆盖已有 Gitviz 安装。结果和截图保存在指定目录。

本机 0.3.0 与 CI 37283842186 的 Windows 干净 runner 均已通过。CI 的 `Windows installed native application` 步骤成功，`gitviz-install-evidence-*` 中的 JSON 和原生截图已下载核对。首次安装与同版本重装不等于 0.2.0 → 0.3.0 升级。原 0.2.0 桌面只提供免安装程序，没有旧版 NSIS 安装记录可迁移。

## VS Code 0.2.0 → 0.3.0

使用原先保留的 0.2.0 VSIX 和提交 `51a873c` 的 CI 0.3.0 VSIX，在 Windows 的 VS Code 1.131.0 实测：

1. 在独立 profile/extensions 安装旧版，打开合成仓库，加载并选择真实旧提交，确认浏览不修改仓库。
2. 正常退出，在同一配置安装新版并启动。核对实际激活版本、包内代码/资源哈希、manifest 原字段，以及用户设定的每批 20 条历史。Git HEAD、引用、index 字节和工作文件保持原样。
3. 通过新版原生确认执行恢复，由真实 pre-commit hook 拒绝提交，保留失败记录、备份和检查点。
4. 正常退出并重启，核对同一失败记录未变化；移除测试 hook，在原生界面确认继续，核对记录完成、原备份保留、新提交父关系与目标 tree、工作区清洁。

VS Code 会改写 manifest 排版并追加 `__metadata`，因此仅对该文件排除安装元数据后比较 JSON；其他包文件逐字节核验。失败记录在新版中生成，此检查证明其跨重启恢复，不声称原 0.2.0 已有新版操作日志格式。

可用 PowerShell 7、Node 24、Git、已安装 VS Code 和现有 `playwright-core` 复验。脚本只连接实际 VS Code，不下载或启动独立浏览器，不安装到日常配置：

```powershell
./scripts/test-vscode-upgrade.ps1 `
  -OldVsix 'F:/gitviz/artifacts/gitviz-0.2.0.vsix' `
  -NewVsix 'F:/Codex/work/gitviz-product/delivery-ci-linux-51a873c/gitviz-0.3.0.vsix' `
  -TestRoot 'F:/Codex/work/gitviz-product/new-vscode-upgrade-test' `
  -PlaywrightCorePath 'F:/gitviz-work/browser-check/node_modules/playwright-core'
```

包路径按实际下载位置替换，`TestRoot` 必须尚不存在。脚本发现 9235 端口被占用会停止。结果含每阶段实际宿主/插件版本、包 SHA-256、Git HEAD 和截图；正常完成后关闭自己的 VS Code，保留测试目录。不要将测试合成仓库中的 hook 放进用户项目。

本轮证据位于 `F:/Codex/work/gitviz-product/vscode-upgrade-030/`；旧包 SHA-256 和新版 CI 包 SHA-256 见 `result-old.json`、`result-upgraded.json`。整理后的 PowerShell 驱动在包含空格的全新目录 `F:/Codex/work/gitviz-product/vscode upgrade verified/` 再次全部通过，覆盖冷启动引导、升级和重启恢复。测试应用已正常关闭，9235 端口已释放。

## 仍需验收

DSH 0.2.0 → 0.3.0 的实际插件升级、桌面免安装旧版到 NSIS 的用户数据衔接、最终三端完整冒烟，以及其他操作系统的原生 UI 尚未因本页证据关闭。签名、公证和正式外部发布也不在上述检查范围内。

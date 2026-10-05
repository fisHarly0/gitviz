# 构建、检查与发行边界

当前源码版本为 **0.3.0 开发版**。CI 产物是指定提交的验证构建，不等于已发布到 GitHub Releases、VS Code Marketplace 或 npm。

## 自动检查

`.github/workflows/ci.yml` 在 main 推送、PR、`v*` 标签或手动触发时运行。Windows 2022、Ubuntu 24.04、macOS 15 分别执行：

1. 锁定依赖安装，版本一致性与 lint。
2. 前端、真实 Git 操作/进程/宿主生命周期、DSH、大历史测试。
3. 三个前端构建；插件打包、完整性检查和重复构建校验。
4. Rust `check --locked --all-targets` 与真实 Git 测试，消费同一 job 生成的 2000/5000/10000 提交仓库。
5. 原生程序构建；Windows 另打包 NSIS 安装程序，并测试首次安装、真实 WebView/Git 浏览、同版本重装和卸载。
6. 生成源提交/版本/工具链记录、SHA-256 清单，保存 14 天的 CI artifacts。

任何步骤失败均阻止后续产物上传。原生测试串行运行，Git 超时测试不会跳过；CI 缺少 Rust 大历史 fixture 会失败。测试只使用 runner 临时目录，和开发者本机的 F 盘约定相互独立。

Windows 安装冒烟使用全新的临时目录与 WebView 数据，截图和结果单独保存为 `gitviz-install-evidence-*`。它会拒绝覆盖已有 Gitviz 安装，并核对浏览没有修改仓库；同版本重装不等于跨版本升级。这份工作流尚不包含 VS Code/DSH 可视化宿主、跨版本升级、签名或公证测试。Linux/macOS 的程序编译与后端测试也不能证明其原生 UI 已验收。真实运行结果以 [Actions](https://github.com/fisHarly0/gitviz/actions/workflows/ci.yml) 对应提交为准。

2026-10-05 实测提交 `51a873c` 的 [三系统流水线](https://github.com/fisHarly0/gitviz/actions/runs/37283842186) 全部成功。下载后的 manifest、SHA、插件内容、Unix 程序权限和 Windows 安装证据已核对。构建清单见 [0.3.0 验证产物](releases/0.3.0-validation.json)；其中源提交是验证构建来源，后续仅测试/文档提交不会改变这批包。之前的 Windows 偶发超时清理失败未确认根因，按 [进程说明](git-processes.md) 保留风险。

## 版本与本机产物

根 `package.json` 是版本真源。`npm run version:set -- x.y.z` 同步 npm lock、两种插件、Tauri 及 Cargo manifest/lock；`npm run version:check` 在不一致时失败。标签构建要求 `v<版本>` 一致。版本必须是三段数字，以兼容 VSIX。

```powershell
$env:npm_config_cache = 'F:\dev\cache\npm'
$env:CARGO_HOME = 'F:\dev\cache\cargo'
$env:GITVIZ_ARTIFACTS_DIR = 'F:\Codex\work\gitviz-product\release-candidate'
npm ci
npm run extension:package
npm run dsh:package
npm run package:check
npm run delivery:test
npm run desktop:bundle -- --ci --bundles nsis
```

NSIS 输出在 `src-tauri/target/release/bundle/nsis/`；免安装程序在 `src-tauri/target/release/gitviz.exe`。`useLocalToolsDir` 让打包工具缓存在项目的 `target/.tauri/`，避免本机默默写到 C 盘。将选定原生产物复制到 `GITVIZ_ARTIFACTS_DIR` 后运行 `npm run artifacts:manifest`。

本机 Windows 安装验证使用 PowerShell 7 与 Node 24：`./scripts/test-windows-installer.ps1 -Installer <安装包绝对路径> -TestRoot <尚不存在的绝对测试目录>`。脚本安装后启动原生程序，读取合成仓库，验证重装保留 WebView 数据，最后卸载并保留测试证据。2026-10-05 的本机 0.3.0 NSIS 已通过这些步骤；CI 37283842186 的干净 Windows runner 随后也通过；旧版本衔接另行验收。

`build-manifest.json` 记录源提交、工作树是否修改、平台、Node/Rust 及每个产物的大小和 SHA-256；`SHA256SUMS.txt` 也覆盖 manifest 本身。工作树 dirty 的产物不能冒充该提交的干净发行。

Linux/macOS 验证程序放在含许可证的 `.tar.gz` 内，避免 Actions 外层 ZIP 丢失可执行权限。下载后在对应系统用 `tar -xzf <文件名>` 解包；这些构建仍需匹配系统运行库，尚未作为正式支持平台的安装包发行。Windows NSIS 内包含许可证，验证产物目录也附独立许可证。

VSIX 使用固定 ZIP 时间和权限；两个插件包对相同文件输入重复打包的 SHA 必须一致。`.gitattributes` 固定文本 checkout 换行。不同系统的原生程序、签名、平台 SDK 和编译工具链会影响二进制，本项目不声称原生跨系统逐字节可复现。

## 正式发布前

桌面安装、VS Code 跨版本升级与重启恢复的脚本、实测范围和剩余缺口见 [安装与升级验证](upgrade-testing.md)。

完成 [公开产品清单](../spec/modules/public-product.md) 中未关闭项，核对干净提交、更新发布说明，安装并升级最终包，在三端重复原生冒烟。确定支持平台及限制后再创建正式 Release；不能只因 CI 通过就自动发布。当前没有自动上传商店、签名凭据或正式 Release 发布步骤。

外部 Actions 固定到完整 SHA，权限为 `contents:read`，不保存 checkout 凭据。构建依赖参考 [GitHub Actions 安全建议](https://docs.github.com/en/actions/reference/security/secure-use) 和 [Tauri Windows 安装包说明](https://tauri.app/distribute/windows-installer/)。

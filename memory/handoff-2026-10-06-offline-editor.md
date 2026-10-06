# 桌面离线编辑验收

用户已明确恢复工作，并确认新截止时间为北京时间 2026-10-07 00:00（2026-10-06 16:00 UTC）。旧 15:00 停止交接作为历史保留，本交接覆盖其未完成状态。

## 变更

桌面按需加载打包的 Monaco 0.55.1 及 editor/JSON/CSS/HTML/TypeScript workers；保留原语法语言与编辑/提交流程，首次打开编辑器不访问 CDN。依赖由已有 peer 明确为直接固定版本，没有升级其传递依赖。Vite 原样加入上游 LICENSE/ThirdPartyNotices 资产。dev/build 使用 `scripts/vite.mjs` 在加载原生转换器前设置与 CI 相同的默认线程栈/并发，并尊重用户显式环境。

## 已核对证据

- 31 项前端测试通过，lint、版本一致性与 diff 检查通过。
- 默认 `npm.cmd run build` 通过；桌面 Rust release check 与最终原生构建成功。大型编辑器 chunk 警告保留，编辑器仍为按需加载。资源体积增加，不宣称首屏更小。
- 最终构建含许可证资源，原生 WebView2 请求均返回正确原文；构建资源 SHA 与依赖原文相同。
- `F:/Codex/work/gitviz-product/offline-editor-resumed-final/result.json` / `smoke.log`：全新 profile、外部 HTTP(S) 被阻断，五类 worker 启动且均为本地资产；没有任何外部资源请求或页面错误。差异查看器另使用同源 blob worker。
- 真实合成仓库测试：只打开/取消编辑不写入；取消保存保留草稿与原文件；保存后的内容、父提交、Git 身份与 clean 状态正确；正常关闭/重启后读取保存内容，仍不访问外部网络。
- 最终程序 `src-tauri/target/release/gitviz.exe` 为本机验证构建，不冒充干净 CI 发行包。构建日志 `offline-editor-check.log`、`offline-editor-final-build.log` 位于上述 scratch 的父目录。
- 旧 `offline-editor-verified/` 是许可证资产加入前的验证，本批以 `offline-editor-resumed-final/` 为准。新测试自启/关闭原生程序，不使用替代后端，不改变系统网络设置。

## 接续

核对本批三系统 CI，从对应干净提交取得安装包和校验和，继续最终包三端验收及首次使用剩余项。Git hooks、签名服务、外部 schema 和 GitHub 在线功能不在离线承诺内。Linux/macOS 原生 UI、陌生用户试用、最终发行验收仍未因此完成。到新截止时间停止，并按已取得证据交接。

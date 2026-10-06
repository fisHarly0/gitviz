# 启动诊断与可访问性实测

工作区 F:/gitviz，main，基线 d438d00。上一轮地图布局已完成并推送，不重做其设计评审。

## 本批

- 升级驱动启动超时后，在清理自己的测试应用前调用 `tests/helpers/capture-desktop-startup.ps1`。按 PID/预期 exe 验证，记录窗口类、线程状态、模块地址，并可生成 MiniDumpNormal。正式程序未加遥测或修改启动逻辑，转储不自动上传。
- 升级驱动正常关闭追加退出码 0 检查；不能让异常退出冒充通过。
- 健康进程上的实际转储以 MDMP 头核对有效；错误预期 exe 被拒绝，且未创建输出目录。Windows API 依据 Microsoft MiniDumpWriteDump 文档，采集在独立进程中执行。
- 八次有界启动探测，新 profile 与复用 profile 交替，均在约 0.7–0.9 秒出现 WebView，真实窗口正常关闭、退出码 0。证据 `F:/Codex/work/gitviz-product/startup-diagnostics-20261007-verified/`。初始探测脚本未等候 CDP page 对象出现而失败，已修正观测等待，保留原目录；它不是产品启动故障。
- 这批没有复现此前只有 Tao 内部窗口的间歇性失败，不能宣称根因定位或修复。

## 可访问性发现

独立 scratch 安装 axe-core 4.14.0（缓存 F:/dev/cache/npm），向自己原生 WebView 注入，只读扫描 7 个状态。真实 hook 失败、继续提交与正常退出流程仍通过。

`docs/accessibility.md` 与 `F:/Codex/work/gitviz-product/a11y-desktop-d438d00/axe-*.json` 保存原始发现：拖放提示、分支编号与文件状态徽标对比度不足；普通/折叠节点 aria-label 覆盖可见内容，触发 label-content-name-mismatch。确认弹窗无 violation，但仍有 incomplete。尚未修改这些生产文件；下一批应针对这些证据修复，并覆盖共享地图的另外两端与深浅主题。不能宣布全面可访问性已完成。

## 用户试用与边界

用户回复这次尚未亲自试用，将后续安排朋友测试。新增 `docs/usability-trial.md` 作为待执行任务和反馈表，不伪造真人试用记录。

d438d00 / CI 37503990486 的 Linux/macOS 产物已经下载到 `F:/Codex/work/gitviz-product/release-d438d00/`，逐项 SHA、字节数、干净源提交、Unix 执行位及跨平台插件相同验证通过。这两平台的构建产物不代表原生 UI 已验证。

Windows CI 在安装后打开真实仓库时超时；原生 WebView/初始屏幕已经就绪，区别于此前没有 Tauri 窗口的启动故障。已下载失败验收证据，只有 installed-binary-first.json；旧驱动没有在失败时抓页面，因此不能从该次记录确定是丢失拖放还是打开失败。

`tests/installed-desktop-smoke.mjs` 改用真实路径输入（CDP Input.insertText）、等待打开按钮可用再点击，移除固定 500ms 延时后发送模拟拖放的依赖。增加失败截图、正文/输入/页面地址/错误 JSON。实际 Git/存储/字节断言保留，桌面拖放覆盖仍由其他原生脚本负责。Windows 安装驱动也核对正常退出码。

使用 d438d00 本地原生 exe 单独打包 NSIS，修正后的完整首次安装/同版本重装/卸载验证通过，证据 `F:/Codex/work/gitviz-product/installed-path-entry-d438d00/`。源码未变，原始 exe SHA 仍为 f78448145a793296f9d2949754aeb08e1ce349d2fe465e03f69be0131f89dbe9。这不是失败的 GitHub Windows runner 已恢复成功，须等新提交 CI。

## 接续

先检查包含安装驱动修正的新提交 CI，再修复已定位可访问性问题，重建三端验证，选最终发行候选做安装升级。不要先对将被修复替代的版本重复全套升级流程。完整公开产品目标仍未完成，启动风险和外部真人/平台验收继续保留。

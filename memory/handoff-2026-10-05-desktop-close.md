# 桌面正常关闭保护交接

项目 `F:/gitviz`，main，基线 `3e8c0c3`；接手时仅有本批决策文档，其他文件干净。完整目标仍为公开产品交付，`spec/modules/public-product.md` 六项顶层验收均未关闭。用户已授权持续完善与提交推送；本批完成后按该授权推送源码，不发布正式版本。

## 已实现

- `desktop-close-controller.js` + `useDesktopCloseGuard.js` 处理真实 Tauri 关闭事件。关闭监听成功注册后才允许本地写入；注册失败显示原因。无草稿直接关闭；草稿复用确认框，取消保留；重复请求合并；关闭失败可重试。只增加 main 窗口的 `core:window:allow-destroy`。
- `useOperationDialog` 同步检查活动操作和待答确认；关闭确认自己也占用门禁。现有 Git/编辑确认不会被关闭请求替换，执行中不会自动排队退出。
- EditorPanel 同步报告内容与提交说明是否修改，卸载清理；仅提交说明也触发关闭或取消编辑确认。保存中编辑器只读，避免正在提交时继续修改后丢失新输入。
- ExportButton 从对象读取、原生保存框、压缩到写盘都经 adapter.runTask 门禁；与仓库切换/写入/关闭互斥。编辑未结束时不导出。
- App 提示关闭被阻止的原因，已有对话框内也可见。未修改历史图、Git 后端、记录格式或两个插件宿主。

## 本轮证据

- `npm test`：20/20，含新增 6 项关闭控制逻辑测试。
- `npm run lint`：通过。`npm run desktop:build -- --ci`：Vite 与 Rust release 通过，Rust 编译约 3 分钟。日志 `F:/Codex/work/gitviz-product/close-desktop-build.log`。构建使用 F 盘 Cargo/npm 缓存，单 job、离线已有依赖。
- `node tests/desktop-close-smoke.cjs`：6 组独立原生应用全部正常退出；真实 Windows WM_CLOSE，无 Git IPC 模拟。无修改、仅提交说明、重复关闭、取消/放弃、已有 Git 与编辑确认、真实 pre-commit hook、原生导出保存框/取消、成功提交后关闭、失败后文件/index/记录保留全部通过，WebView 页面错误 0。
- 960×600 确认框边界与 Tab 焦点通过，默认焦点取消，Escape 保留内容；截图已检查。报告与截图 `F:/Codex/work/gitviz-product/close-tests/close-result.json`、`close-draft-confirm-960.png`、`close-during-commit.png`；汇总日志 `F:/Codex/work/gitviz-product/close-smoke.log`。
- 首次实机脚本在第三个窗口的开仓阶段超时：落地页 DOM 早于原生拖放订阅。测试只对未产生错误且尚未加载仓库的启动拖放做至多 3 次重试，并保存失败 DOM；修正后整套通过。不是绕过实际 Git 错误。
- Impeccable detector 本批运行一次：EditorPanel 既有 SFMono-Regular 与 CommitDetail 既有 #666 命中两项设计档案告警，均为基线已有声明，本批未改；不扩展为视觉系统重构。

## 范围与接续

- 仅正常桌面窗口关闭；强杀、断电、WebView 崩溃和插件宿主退出尚不在本批保护内。不承诺跨进程恢复内存草稿。原生导出验证了保存框期间关闭与取消，未写 ZIP；导出内容验证沿用已有证据。
- 未重复三端 10000 历史、VS Code/DSH 实装或 Rust Git 后端测试；这些代码本批未改。旧 artifacts 的 0.2.0 包不包含新代码，当前 release exe 仍使用开发中的 0.2.0 元数据，不能称作正式发行。
- 测试自行关闭所有自启应用，最后核对 CDP 9248 端口；未操作用户日常宿主。
- 下一批先核对三端准备/确认信息完整性和异常 Git 进程/超时处理，随后推进地图折叠、概览和正式发布流程。一次一模块，保留完整公开交付目标。

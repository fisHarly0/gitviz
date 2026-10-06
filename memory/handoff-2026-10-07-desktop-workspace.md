# 桌面地图空间与恢复入口

工作区 F:/gitviz，main，基线 46c1417。用户北京时间 01:30 检查进展；完整公开产品目标保持进行中。

## 改动

- 本地与只读分支栏使用原生 details，默认显示当前位置和数量。展开后沿用原切换/只读行为。可导出试验分支的“导出分支”独立显示，完整名称保留 title。
- 桌面地图列宽由 38% 调为 48%；低高度窗口压缩工具与说明间距。长分支不挤压导出、底栏与返回按钮；实际位置只省略分支名，HEAD、预览和未提交状态单独可读。
- 存档操作失败保留完整详情，新增直接打开持久记录、聚焦其 summary 的入口。继续提交条件与实际 Git 写入逻辑不变。
- README、首次使用、失败恢复说明和受影响的原生测试同步。

## 验证

- 31 项前端测试、lint、桌面 release/前端构建、VS Code/DSH 前端构建通过。没有修改 Rust。
- `tests/desktop-workspace-smoke.cjs` 在原生 Tauri/WebView2、独立 profile 和 2000 条合成 Git 历史中通过：宽窄地图空间、长分支切换/折叠、键盘焦点、导出保持可见、真实 hook 拒绝、展开错误、直接进入记录并继续提交。
- 核对浏览/切换同提交时 HEAD 与工作区保持、继续后的父提交和目标 tree、clean 工作区、无 pageerror、正常退出码 0。
- 证据 `F:/Codex/work/gitviz-product/desktop-workspace-20261007-final/`，四张截图和 `result.json`。960×600 常规画布高度 195.9px，长分支单独断言至少 180px 通过。实际 WebView 使用 CDP viewport 模拟该尺寸，不冒充所有 DPI/显示缩放组合。
- 本地原生 exe：`F:/gitviz/src-tauri/target/release/gitviz.exe`，SHA-256 `f78448145a793296f9d2949754aeb08e1ce349d2fe465e03f69be0131f89dbe9`。这是本批源码构建，不是 486dae3 固定 CI 发行包。
- 初轮长导出名称挤压和实际状态整行截断已保留失败截图；独立评审要求按低高度任务可用性修复，最终按同一宽窄/长分支场景复验。不用降低断言掩盖问题。
- 独立完成评审最终 disposition 为 ship，仅覆盖本批 Windows 桌面改进；三项 material fixes 均 resolved。设计文档增量核对通过，未改 DESIGN.md/design.json，报告 `F:/Codex/work/gitviz-product/desktop-workspace-design-review.md`。

## 范围与接续

固定 486dae3 包的三端升级和关闭验收见前批交接；其后间歇性桌面启动风险仍未定位，不因本次启动成功关闭。完整可访问性、陌生用户试用、其他平台原生界面和正式发行尚未完成。本批新布局尚未进入固定发行包安装升级验证。

所有测试应用已正常退出，合成仓库与失败/成功证据保留。下一步先对本批 CI 与新产物做对应核对，再继续公开产品首次使用和发布验证；不重复已经覆盖的全部 Git 写入用例。

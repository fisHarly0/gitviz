# 可访问性已定位问题修复

工作区 F:/gitviz，main，基线 613e44c，开始时工作树干净。本批范围限定为前次原生 axe 报告中的四处问题。

- src/App.css：移除拖放提示与分支编号文字透明度。
- src/components/CommitDetail.jsx：新增/修改徽标深色前景，其余状态和背景不变。
- src/version-tree/TreeMap.jsx：普通/折叠按钮使用可见内容形成名称，保留 aria-pressed、键盘和点击行为。
- .impeccable/surfaces/desktop-workspace.md 记录本批验收范围；完整报告 docs/accessibility.md。

31 项前端测试、lint、三端构建通过。桌面构建工具第一次异常退出，原命令重试成功；日志位于 F:/Codex/work/gitviz-product/a11y-fix-build*.log。

F:/Codex/work/gitviz-product/a11y-desktop-fixed-20261007/ 保存七份 axe 报告、宽窄/长名称/失败截图与 result.json。七份报告 violation 均为空，真实失败提交继续后的 Git 结果、焦点与正常退出码 0 通过。保留 incomplete 未通过状态，不能声称全面 WCAG 合规。其他宿主本批只构建，未重新运行原生界面。

用户将后续安排朋友测试，docs/usability-trial.md 仍是待执行模板。公开产品目标保持未完成；下一步补地图容器语义和人工对比度判断，再覆盖插件主题与辅助技术。最终候选仍须安装升级验收，历史间歇性启动未定位，其他系统原生 UI 和正式发布仍缺证据。

独立完成复核 disposition 为 ship，仅覆盖本批四处修正及 Windows 原生证据。设计文档对比确认无需改 DESIGN.md / .impeccable/design.json；已有设计文档覆盖缺口保留，不扩展成全面重整。

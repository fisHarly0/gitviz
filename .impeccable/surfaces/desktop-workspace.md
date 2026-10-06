# Desktop workspace

Mode: Operate. Targets: desktop branch navigation, graph column and action failure feedback.

THESIS: 先看到版本地图与实际位置，再按需展开切换分支或失败细节。沿用现有深色、绿色实际位置与琥珀预览，不改变 Git 操作语义。

FIRST VIEWPORT: 地图约占 48% 宽度；分支栏默认仅显示当前分支和数量，仅在原有可导出的试验分支条件成立时独立显示“导出分支”。展开后键盘可选完整分支列表；收起不切换仓库。长名称换行或省略且可读取完整标题，960×600 仍保留可用画布；HEAD 与工作区状态不能随长分支名一起截断。

RECOVERY: 失败保留完整错误但按需展开，提供刷新实际状态和直接查看持久记录。点击记录入口展开并移动焦点；仅已有检查点允许继续提交，不把所有失败当成可恢复提交。

VERIFY: Windows 原生 WebView2，1280×800 / 960×600，长分支、多分支、真实 hook 拒绝与继续恢复，记录 Git HEAD/tree/工作区不变量。构建前端、lint、既有单元检查；机械布局扫描与独立完成复核。

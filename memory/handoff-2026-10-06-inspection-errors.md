# 详情重试与地图焦点接续

基线 db28120；其 CI37416907089 已确认 Windows、Linux、macOS 全部成功，超时恢复验收批次可继续。用户更新工作截止时间为北京时间 2026-10-06 15:00（07:00 UTC），目标范围不缩减。

## 已完成

- VS Code/DSH 共享 VersionTree：详情和比较失败就地显示原因与重试；结果绑定快照、OID/比较方向、重试次数，旧结果不再被当前选择误用。仍检查返回的版本身份。等待第二节点、读取中、失败、无变化、文件列表分别显示。
- 文件区域有名称、忙碌状态、错误/状态播报；键盘重试先把焦点移入稳定区域，结果出现后 Tab 可进入文件按钮。
- 共享 TreeMap 仅在选择或显式定位改变时移动焦点；初次挂载、窗口尺寸与缩放改变只定位视图，不抢检查器或工具按钮焦点；清理待执行动画帧。
- 首次使用说明、发布草稿同步；纠正 GitHub 仍为旧地图的过时描述。未新增 Git 写入权限或修改后端。

## 证据

- `npm test` 31/31、lint、三端前端构建和 diff 检查通过。
- `tests/inspection-read-smoke.cjs` 在 Windows VS Code Integrated Browser 内加载实际构建的 VS Code bundle，受控桥接完成 19 次请求：详情/比较失败和键盘重试、重试中焦点、尺寸/缩放不抢焦点、方向键定位、迟到失败/比较方向、相同 OID 更换仓库、等待第二节点及空比较；无 Git 写入请求。
- `F:/Codex/work/gitviz-product/inspection-read/result.json`、`smoke-final.log`、`error-1280.png` / `error-392.png`。已查看宽窄截图，错误长路径能换行，按钮可见且无文档横向溢出。
- 初次脚本对带“修改”子标签的文件名使用 exact 文本定位，已改为文件名元素定位；Integrated Browser 键盘测试使用定位器 press 明确目标。早期失败日志保留，不作为成功证据。
- 这是构建后前端契约验证，不能代替实装 VS Code / DSH 的完整后端和最终包验收；未宣称屏幕阅读器、其他系统原生界面或陌生用户试用已完成。

复现：在隔离 VS Code profile 打开 CDP9235，设置 `PLAYWRIGHT_CORE_PATH`、绝对目录 `GITVIZ_INSPECTION_EVIDENCE`，执行 `npm run extension:build` 和 `node tests/inspection-read-smoke.cjs`。脚本临时监听 loopback5173并在结束时关闭；仅连接现有 Integrated Browser，不启动独立浏览器，不操作真实仓库。

继续核对本批 CI，推进 P2 剩余首次使用/可访问性与 P3 最终构建、安装、升级和三端冒烟。总目标未完成；截止前需交代实际状态。

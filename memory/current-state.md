# 当前状态 / Current State

更新时间：2026-10-07

**公开产品目标继续执行，用户北京时间 01:30 检查。** 当前接续：`memory/handoff-2026-10-07-desktop-acceptance.md`。固定 486dae3 CI 产物的 Windows 三端完整升级与重启恢复均已通过；桌面六组关闭保护追加原生退出码断言后全部通过。间歇性 WebView 启动超时仍未定位根因，不能宣称修复。完整可访问性、陌生用户试用、其他平台原生界面与正式发行仍未完成。

本批只改测试诊断和验证记录，不改变固定产物。下一步：桌面地图空间与失败恢复入口的可用性改进；启动风险继续保留。以下为历史批次，不覆盖本段接续与范围。

此前检查器批次见 `memory/handoff-2026-10-06-inspection-errors.md`：VS Code/DSH 详情和比较失败就地重试、结果绑定当前仓库/版本；地图尺寸与缩放不抢焦点。31 项前端测试、三端构建、lint、Integrated Browser 构建后受控契约/宽窄视口验证通过。上批 db28120 / CI37416907089 三系统全部成功。继续 P2 首次使用/可访问性与 P3 最终包；其他平台原生 UI 与陌生用户试用仍缺证据，完整公开产品目标未完成。

前批 P1 审查见 `memory/handoff-2026-10-05-p1-audit.md`，17 份原生结果对应 `docs/p1-acceptance.md` / `docs/p1-evidence.json`。下文为各历史批次记录，不覆盖顶部接续入口。

文档维护：README 已按 0.3.0 现状重整，更新三端入口、试验流程、安装与验证边界，并清理过时说明；不改变下方产品任务的接续入口。

当前接续：`memory/handoff-2026-10-05-trial-journey.md`，优先于下方历史批次。用户认可评价后授权继续完善完整操作流程。本批接通插件 HEAD 比较/退出预览、桌面与 DSH 试验工作区打开/返回、VS Code 新窗口指引，以及桌面当前试验分支直接编辑。Windows 三端原生完整流程通过，原仓库未提交内容和试验修改保留；25 项前端、10 项 DSH 测试、lint、三端构建与插件检查通过。基线 9809730 / CI37297161250 三系统成功。本批开发包 SHA、证据与边界见交接。返回记录仅在本次会话保留，真实陌生用户试用尚未进行。下一步 P2 GitHub/可访问性缺口、P1 最终核对、P3 最终包验收；完整目标仍未完成。

最新批次：地图折叠与探索（基线 7ed3601）。三端共享连续提交折叠、引用查找/定位、父子关系附近探索；搜索/比较/键盘仍使用真实提交。Windows 桌面、实装 VS Code/DSH 各通过 10000 条真实历史的浏览检查，HEAD、工作区和引用均未变化。当前接续见 `memory/handoff-2026-10-05-map-exploration.md`；公开产品清单中 P2 地图项已关闭，完整目标保持未完成。

本批 `npm test` 25/25、history:test 4/4、lint 和三端构建通过；当前开发包在 `F:/Codex/work/gitviz-product/map-final-packages/`，源码及其打包版本均实测。证据 `map-ui-tests/`；窄面板引用页不再压缩画布，返回/Esc 焦点、虚线摘要与淡化修正通过独立复核。自己的测试应用已关闭。下一模块进入首次使用或工程发布门禁；多宿主完整原生并发、其他平台、正式安装升级仍待完成。旧 0.2.0 包不会自动升级。

上批三端原生失败流程（7ed3601）见 `memory/handoff-2026-10-05-native-failure-flows.md`：worktree 占用、确认后 index 锁、真实 ACL 拒绝、hook 失败及取消/继续，DSH 执行中停用后完成记录；修复桌面恢复成功后的旧分支提示。

上批插件生命周期见 `memory/handoff-2026-10-05-plugin-lifecycle.md`：独立 worker、迟到确认拒绝、VS Code 实装退出验证。extension:test 45/45、DSH 共 10 个不同用例及 Node/Electron worker 退出测试通过。强杀 worker/整个进程树或断电仍可留下未完成现场。

上批 Git 执行结果核对见 `memory/handoff-2026-10-05-operation-outcomes.md`：检查位置、父提交、tree、工作区及备份，拒绝暂存混入内容并保留实际现场。Node 共 40 个不同用例、Rust 共 25 个不同用例及 DSH 8 项通过；前后检查不构成跨程序原子事务。

上批预检对齐见 `memory/handoff-2026-10-05-write-preflight.md`：稀疏、隐藏 index 标记、子模块显示配置与 linked worktree 状态检查已补齐。

上批进程生命周期修复见 `memory/handoff-2026-10-05-git-process-lifecycle.md`：超时等待进程清理和输出关闭，无法确认停止时暂停写入并保留已有锁；普通失败保留现场并可按检查点继续。Windows 实测，Unix 未运行。

## 当前目标：公开产品交付

用户在 0.2.0 推送后授权持续完善至公开产品交付标准。验收入口：`spec/modules/public-product.md`；决策：`docs/decisions/2026-10-04-public-product.md`。基线 main / decad8e，开始时工作树干净。先统一桌面真实 Git 写入与失败恢复，再完善地图概览/折叠和发布 CI。以下 0.2.0 记录为已完成基线，不代表当前完整目标已达成。

2026-10-05 已加入桌面正常窗口关闭保护：内容/提交说明草稿取消后保留；已有 Git 或编辑确认不被覆盖；Git 操作和整个导出占用同一门禁；失败保存后关闭仍保留文件/index/恢复记录。20 项前端测试、lint、桌面 release 构建与 6 组独立原生窗口场景通过，包括真实 hook 和导出保存框。关闭批次见 `memory/handoff-2026-10-05-desktop-close.md`。仍缺异常进程/超时、剩余预检与插件宿主退出边界，以及后续 P2/P3；公开产品目标保持未完成。

前批已接通三端持久操作记录与失败提交继续入口：共用 JSON v1、按 worktree 隔离、确认前后核对 HEAD/分支/index tree/工作文件，保留备份和错误；桌面编辑未结束时禁止继续其他提交。Rust/Node 双向续交测试通过；DSH 实机发现宿主没有 `useEffectEvent`，已改用兼容 Hook。见 `memory/handoff-2026-10-05-operation-recovery.md`；上批桌面动作见 `memory/handoff-2026-10-05-desktop-actions.md`。

- 项目定位：游戏存档式 Git 可视化。现有 Tauri 2 + Rust(gix) 桌面应用，以及 VS Code / DSH 交互式版本树插件。
- 当前状态：0.2.0 三端大历史地图已完成；桌面原生 / VS Code / DSH 均通过 10000 条实机检查，Node / Rust 的 2000/5000/10000 历史测试通过。三个本地包及 SHA-256 位于 artifacts/。旧桌面写入、if 导出、diff 和 GitHub 只读浏览保留；MSI/NSIS 安装包尚未完成。
- 架构边界：前端通过 adapter 调用 Tauri command；本地模式可写，GitHub 模式只读；capabilities 保持最小权限。
- 真源：`README.md`、`gitviz-档案/`、`src/` 与 `src-tauri/`。
- 当前工作区：`F:/gitviz`，按用户要求迁移。测试工作区：`F:/gitviz-work`。原 D 盘目录保留，后续以 F 盘为准。
- 当前交接：`memory/handoff-2026-10-04-large-history.md`。DSH 首版见 `memory/handoff-2026-10-04-dsh.md`；VS Code 首版见 `memory/handoff-2026-10-04-vscode.md`；桌面早期修复见 `memory/handoff-2026-10-04.md`。

## 最新大历史批次（0.2.0）

- 三端本地地图共享分页、全历史搜索与视口渲染。默认 300 条是每批数量，不是总数上限；读取 heads/remotes/tags/HEAD 的本机可达历史，不自动 fetch，浅克隆明确提示。
- Node / Rust 分页携带仓库引用与 shallow 状态 revision；历史变化拒绝旧 cursor。旧 HEAD 首批固定显示，下一批不会漏掉边界节点。
- 选节点只预览，HEAD 与工作文件不变；搜索定位、停止加载、跨视口键盘操作已在三端 10000 条仓库实测，桌面横竖图也通过。桌面本地新地图需 PATH 中的 Git；GitHub 在线图和旧 gix 写入边界未扩展。
- 测试副本、截图和日志：`F:/Codex/work/gitviz-large-history`；缓存仍在 F 盘。用户随后授权更新 README 并推送，0.2.0 源码与文档纳入本次提交；生成安装包保留在本机，未发布商店。推送范围见 `docs/decisions/2026-10-04-readme-push.md`。

## 接手约束

涉及真实仓库写入、分支创建、导出 loose objects、GitHub PAT 或 Tauri 权限时，先核对安全边界和回滚点。不得把用户仓库路径、PAT 或导出内容写入档案。

## 上批桌面修复

- 已增加桌面启动、免安装包构建命令及 Node 引擎要求；F 盘 release 可执行文件已构建成功。
- 浏览器默认 GitHub 只读入口；修复输入校验、加载防重、会话存储受限、空仓库与权限错误提示。
- 修复提交后换仓库未重置会话、本地初始分支与实际 HEAD 不一致、点击 HEAD 无详情，以及 GitHub if 分支错误显示导出入口。
- 修复 Rust 提交差异方向反转；真实合成仓库新增/修改/删除、编辑提交和导出后 fetch/SHA 一致性验证通过。原生文件对话框未自动化验证，详见当前交接。
- 校正并保留原有 README/TUTORIAL 草稿，加入真实截图与本地写入边界说明。
- 不修改 Rust Git 写入、导出格式、gix 版本或 capabilities；本地编辑仍为直接写工作文件、仅切换 HEAD 的实验性实现。
- 未提交、未推送。README/TUTORIAL 包含接手前已有内容，提交时须区分原稿与本轮修改。

## 最新 DSH 插件批次

- `extensions/dsh/` 接入 DSH 0.2.0-rc.2 Web，侧栏/main 插槽、宿主 React、主题变量和有界逐行差异；本机仓库选择与 DSH 会话工作目录相互独立。
- 复用 GitService，新增同源本机请求限制、仓库句柄、5 分钟一次性写入确认。恢复仍为新提交 + 备份分支。
- 构建 `npm run dsh:package`；产物 `artifacts/fisharly-gitviz-dsh-0.1.0.tgz`；测试 `npm run dsh:test`。
- 实际插件管理 UI 安装与启用、10 条 UI 操作和停用/重启用清理验证通过；4 个新增集成测试通过；既有 Git/布局、前端测试、lint 和两种前端构建通过。详见最新交接。
- 没有改用户日常 DSH profile、没有模型调用或真实项目 Git 写入。DSH 测试和日志均在 F:/Codex/work/gitviz-dsh。

## 已完成 VS Code 插件批次

- 用户明确要直观树图、游戏化节点、选择/变换/回滚，确认先 VS Code，后 DSH。新增模块 `src/version-tree/` 与 `extensions/vscode/`。
- 实现拓扑 DAG、完整合并边、主路径优先、平移/缩放/搜索/路径聚焦、键盘节点选择、HEAD 定位、双节点比较和原生 Diff。
- Git CLI 宿主支持创建分支、同步工作文件的分支切换、独立 worktree、备份后恢复为新提交。检查未提交/未跟踪、未保存编辑器、过期 HEAD、进行中 Git 操作、忽略文件碰撞、稀疏检出和子模块。提交 hook 失败保留更改与备份，不强制 reset。
- VSIX：`artifacts/gitviz-0.1.0.vsix`；构建 `npm run extension:package`；Git/布局测试 `npm run extension:test`。不新增生产依赖。
- 验证：19 个 Git/布局用例（最后一轮布局 6/6、Git 服务 13/13）；真实 VS Code 1.131.0 Extension Host、独立配置实装 VSIX 的 11 条 UI 流程、深浅主题、392px 面板、旧 HEAD 截断后定位/键盘回归。
- 研究与验证产物使用 `F:/Codex/work/gitviz-plugin`，合成 Git 用例使用 `F:/Codex/work/gitviz-tests`。没有对真实用户仓库测试写入；没有安装进用户日常 VS Code 配置。
- 既有未提交内容全部保留。本轮未提交、未推送、未发布商店；旧 Tauri 写入逻辑未迁移到新后端。

# 当前状态 / Current State

更新时间：2026-10-05

最新批次：Git 执行结果核对（基线 9b299db）。三端在命令返回后检查位置、目标、父提交、tree、工作区和备份；建立备份后重查位置再恢复文件，恢复/编辑暂存期间混入内容会在 commit 前拒绝且不提供无效续交检查点。真实 hooks 覆盖移动 HEAD、错误父提交、worktree 改文件及暂存混入，保留实际结果并记录失败。当前接续见 `memory/handoff-2026-10-05-operation-outcomes.md`；完整公开交付目标保持未完成。

本批 Node/布局整组 39/39，最后新增备份 hook 用例随 7 项恢复定向回归通过，共 40 个不同用例；Rust 全量 24/24 + 新增备份 hook 1/1，共 25 个不同用例；DSH HTTP 8/8。lint、主前端构建、`cargo check --release` 通过。插件包及 SHA-256 在 `F:/Codex/work/gitviz-product/outcome-packages/`，解包模块与源码一致。本批未重建桌面 exe、未跑原生 UI；旧 process-packages exe 不含最近两批改动。下一模块处理插件宿主退出，再进行三端原生异常流程、地图和发行验收。前后检查不构成跨程序原子事务。

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

# 公开产品完善 · 桌面版本动作

工作区 F:/gitviz，main，基线 dfa1e14；接手干净。公开产品目标持续有效，完整验收仍在 `spec/modules/public-product.md`，本批不是全目标完成。计划和写入决策：`docs/decisions/2026-10-05-desktop-actions.md`。

## 已实现

- 桌面“存档操作”：创建分支、独立 worktree、恢复为新提交，均复用 prepare/execute/cancel。命名/目录填写后预览，取消保留输入；显示目标 OID、分支名、输出父目录与影响文件。建分支/worktree 的差异列表明确原目录不变。
- 完成后显示分支名、实际 worktree 路径或新提交/备份分支；用户点击“在地图中打开试验工作区”才切换浏览仓库。
- 分支栏显示全部本地分支，限制高度并允许滚动；dirty 状态禁用切换/恢复，允许分支与独立 worktree。
- 本地快照统一地图、分支栏及 session 的真实位置。外部 HEAD/分支/游离状态在刷新后同步，预览旧节点保留。编辑中的保存基准不被刷新替换，外部改变后拒绝保存并保留缓冲；结束编辑再读取最新状态。
- 打开仓库先校验再发布会话，拒绝裸仓库；打开失败保持原仓库。新建 worktree 的 .git 文件入口通过实测。
- 原生测试发现并修复切仓后重复操作面板：相邻动作/详情组件必须使用不同 React key。
- 新增纯 session reducer 和回归测试；两套原生 UI 脚本移入 tests/，运行说明 `docs/desktop-testing.md`。不新增运行依赖、不修改 capabilities、不更新旧 0.2.0 包。

## 验证证据

记录目录 F:/Codex/work/gitviz-product：

- `actions-rust-test.log`：7/7 真实 Git 用例通过，新增 dirty 原目录下 branch/worktree 的预览、执行、路径与文件断言。
- `actions-check.log`、`actions-build.log`：Rust release check（locked/offline）及最终原生 release 构建通过。低资源配置 jobs=1、RAYON_NUM_THREADS=2、RUST_MIN_STACK=8388608；缓存 F:/dev/cache/cargo。
- 前端 lint 无警告；`npm test` 14/14，通过新增外部 HEAD、预览保持、游离 HEAD、编辑基准、切库清理用例；前端生产构建和 diff check 通过。
- `actions-ui-result.json`：真实 Tauri/WebView2，命名创建不切换、取消不写入、过期确认拒绝并可刷新重试、恢复新提交/备份、dirty 原目录下独立 worktree、打开关联工作区、打开裸仓库失败保持旧会话、游离 HEAD、失败 hook 保留文件/index/备份、960×600 视口与键盘确认通过；无页面/控制台错误。
- `actions-editor-result.json`：实际 Monaco 编辑、未保存导航保护、编辑中外部 HEAD 改变后拒绝保存且缓冲仍在、取消并选择旧存档重新编辑、确认取消、Git 身份、干净 index、主线切换文件同步通过。
- `actions-restore-confirm.png`、`actions-worktree.png`、`actions-960.png`、`actions-confirm-960.png` 已检查；长分支名/路径可换行，确认框可滚动且在视口内。检测器本批只运行一次：`actions-interface-check.json`，13px 为旧桌面正文值；新标题改用已记录的 14px。
- UI 脚本使用合成拖放事件打开隔离仓库，真实 IPC/Rust 未模拟；原生文件夹选择框仍未自动化验证。小窗口是 WebView 视口模拟，无物理多设备或离线 Monaco 结论。
- 整理进仓库后，按显式 scratch/Playwright 环境变量再次运行 `tests/desktop-actions-smoke.cjs` 与 `tests/desktop-editor-smoke.cjs`，均通过；本批启动的原生测试进程已关闭，无继续运行的测试服务。

## 下一步与完整缺口

1. 三端操作记录与恢复入口：失败后仍保留文件并显示 Git 诊断/备份，但继续提交仍需用户使用 Git。需要持久记录及严格绑定失败状态的继续处理，不能笼统提交任意脏改动。
2. 应用关闭的未保存保护；签名失败、身份缺失、Windows junction/symlink、稀疏/子模块/忽略文件和跨宿主契约的补充验证。Unix 子进程树超时清理仍未完成。
3. 地图连续提交折叠、分支/里程碑概览和节点邻域；小窗口中工具区和分支栏仍占较多空间，属于后续地图可读性批次。
4. 首次使用、语言统一、离线 Monaco、CI、统一版本、根许可证/贡献/安全反馈、正式安装包与干净安装/升级和复杂真实历史验证。现有测试仓库不冒充真实用户项目。

公开发行尚未完成。当前 exe 为开发构建，artifacts/ 的 0.2.0 包仍是旧版；没有发布商店或正式 Release。临时仓库保留在 F 盘供核对，不写入真实用户仓库。

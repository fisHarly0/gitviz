# 三端原生失败流程交接

工作区 `F:/gitviz`，main，基线 `2aa19e4`，开始时干净。完整公开产品目标保持未完成。本批补原生失败证据，下一模块进入地图可读性。

## 改动

- 新增 `tests/native-failure-smoke.cjs`：同一场景驱动实际桌面、VS Code 和 DSH 界面；真实 worktree 占用、确认后 index 锁、Windows refs ACL 拒绝，以及 pre-commit 失败、取消与继续。仅合成仓库受写入。
- Windows ACL helper 保存原 SDDL，限制目标/备份在 scratch，finally 恢复；Node 启动 Windows PowerShell 时清除 PSModulePath，避免继承 PowerShell 7 模块路径造成加载失败。
- 新增 `tests/dsh-lifecycle-smoke.cjs`：实际插件管理页执行中停用、样式/侧栏释放、worker 完成与释放锁、重新启用后读取记录，未调用模型。
- 实机发现桌面继续恢复成功后仍显示先前“分支未切换”。`src/App.jsx` 为分支栏增加仓库及成功恢复 revision 的 key，与已有动作提示同步重建；原错误继续保存在操作记录中。没有在失败后因 HEAD 变化就隐藏异常。
- 使用当前源码重建桌面 exe，包含此前预检、执行结果检查及本次提示修复。VS Code/DSH 复用上批 lifecycle 开发包，安装后的宿主及全部五个共用模块哈希与源码一致；本批没有修改插件生产代码。

## 本批真实证据

根目录 `F:/Codex/work/gitviz-product/`；合成仓库、截图和 JSON 在 `native-failure-tests/`。

| 验证 | 结果 / 证据 |
|---|---|
| Windows 桌面四类失败及继续 | 最终构建通过，`native-failure-desktop-final.log`、`native-failure-desktop.json/png` |
| 已安装 VS Code 四类失败及继续 | 通过，`native-failure-vscode.log`、`native-failure-vscode.json/png` |
| 已安装 DSH 四类失败及继续 | 通过，`native-failure-dsh.log`、`native-failure-dsh.json/png` |
| DSH 管理页 hook 执行中停用，再启用 | 通过，`native-dsh-lifecycle.log`、`dsh-lifecycle-native.json`、`dsh-disabled-worker-completed.png` |
| 前端测试 | `npm test` 20/20 |
| 静态检查 | `npm run lint` 通过 |
| 构建 | `npm run desktop:build -- --ci` 两次成功，首次 7m48s，提示修复后的最终构建 3m59s；各自包含主前端构建 |

每端检查：Git 自身失败显示在 UI；worktree 占用不移动 HEAD；索引锁错误保留 index 字节/文件/原 HEAD 及备份，无无效续交检查点；ACL 拒绝不改文件或 HEAD；hook 失败保留目标暂存 tree 和备份；取消不增加尝试次数；修好 hook 后恢复为新提交，核对 parent/tree/backup/clean，完成记录可见且无临时旧错误。

最终检查还等待界面实际位置刷新，避免把记录刚完成、地图仍在异步重读的瞬间当作最终截图。该等待最后加入公共脚本；桌面在同一个已完成 fixture 上单独验证并更新截图/JSON，VS Code/DSH 的已有截图直接显示对应新 HEAD 与干净状态，未为纯测试等待重复执行写入。

实际截图均已查看。DSH 停用使用管理页真实 switch，停用时真实 hook 尚在等待；停用后 worker 完成，重启用只出现一条完成记录。不是 HTTP handler 接缝测试替代原生证据。

最终 exe：`F:/Codex/work/gitviz-product/native-failure-packages/gitviz.exe`，SHA-256 `0A3E69FC976201ED799ED44A3AA08A1B39DB13693A4F8B7B09325987C3E34AF9`。仍为开发中 0.2.0 元数据，未发布安装包/商店/Release。上批 lifecycle 两个插件包保持不变。

## 环境与限制

- VS Code 隔离 profile `lifecycle-native/profile`、扩展 `lifecycle-native/extensions`；DSH 使用既有隔离 `F:/Codex/work/gitviz-dsh/home`，通过 CLI 安装独立路径 tarball 后重启，未改日常配置。
- Integrated Browser 首次创建了不响应 CDP 的空白页；关闭该测试页后重开，通过现有地址栏加载 DSH，成功后才执行测试。启动 URL 含 token，未打印/提交。Escape 被该承载浏览器截获，DSH 取消用真实“取消”按钮验证；不宣称该环境的 Escape 通过。
- 最初 ACL helper 受 PowerShell 模块路径污染，在保存 ACL 前失败，未改变权限；修正后四类场景重新跑通。失败尝试不计通过。测试 fixtures 留在 F 盘，不删除现场。
- 本批自己的 VS Code、DSH 及桌面进程已结束；收尾核对 9235/3087/9248 无监听。未启动独立 Chromium。Rust 生产代码未改，不机械重复既有后端全量测试；最终 exe 编译覆盖当前 Rust 源码。
- Windows 证据不覆盖 Linux/macOS、远程 VS Code、所有多宿主并发顺序、强杀 worker/整棵树、断电，亦不代表正式安装/升级完成。

## 接续

下一模块按 `spec/modules/public-product.md` 推进连续提交折叠、分支/里程碑概览和围绕选中节点探索，三端共用实现并回归合并边、搜索、键盘与 10000 条历史。P1 剩余多宿主原生集成、其他平台验证，以及 P2 首次使用/P3 CI、许可证、版本、正式安装升级与发布门禁继续保留；六项顶层要求仍未全部关闭。

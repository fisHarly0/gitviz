# 插件宿主生命周期交接

工作区 `F:/gitviz`，main，基线 `dc43f02`，开始时干净。完整公开产品交付目标保持未完成，一次只推进本模块。

## 实现

- VS Code 与 DSH 共用 `OperationHost`，最终确认后启动单项独立 worker。通过 IPC 发送宿主持有的计划，worker 重新打开仓库并执行原 GitService；预检、锁、超时、结果核对及记录仍走同一套代码。锁记录 worker PID。
- worker 在接受任务后不因父 IPC 断开而停止，操作记录落盘后退出。未交接任务在宿主关闭后拒绝；启动握手最多 15 秒。交接失败/异常退出不能自动重放计划。
- VS Code 检查原 panel 身份和扩展激活状态；关闭后返回的确认不写入；已有操作结束时通知重开的 panel 刷新。deactivate 不依赖长时间等待，已经交接的工作由独立进程完成。
- DSH dispose 清理票据/会话并关闭接收入口；读取正文和准备预览完成后再次检查是否停用；已经接受的请求保留局部仓库引用，HTTP 断开不取消 worker。
- 两种插件打包显式包含 `operation-host.cjs`、`operation-worker.cjs`，未新增生产依赖；没有更改 Tauri/Rust 或地图外观。

## 验证与产物

全部使用 F 盘合成仓库及隔离 VS Code profile，没有修改日常配置和真实用户仓库。

- Node 独立 worker 3/3；VS Code `Code.exe` 的 Electron Node 执行环境同组 3/3。真实 hook 阻塞时正常关闭/强制结束测试宿主 PID，worker 完成、写记录、释放锁、自行退出；另一个 Gitviz 写入在此期间被锁拒绝。
- DSH HTTP 原有 8/8，加停用期间延迟正文与执行中停用 2/2，共 10 个不同用例。日志 `lifecycle-dsh-test.log`、`lifecycle-dsh-dispose-test.log`；不是一次完整 10 项命令。
- 解包 DSH 的五个共用模块 SHA-256 与源码一致。使用解包后的 OperationHost/worker 再跑正常宿主退出案例 1/1；日志 `lifecycle-dsh-packaged-worker.log`。
- 实装 VSIX 原生测试通过：确认恢复 → 真实 hook 阻塞 → 关闭面板 → 重开地图 → 退出整个 VS Code → 确认 worker 仍在 → 放行 hook → 核对新提交父关系、目标 tree、干净工作区、完成记录及锁释放。证据 `lifecycle-native/lifecycle-vscode-result.json`、`lifecycle-vscode-running.png`、`lifecycle-vscode-smoke.log`。
- 原生脚本 `tests/vscode-lifecycle-smoke.cjs` 使用 CDP 9235、隔离 profile 与测试辅助命令 `Gitviz Fixture Quit`（只调用真实 `workbench.action.quit`）。准备脚本在工作目录 `prepare-lifecycle-vscode.cjs`；首次启动欢迎向导需完成，命令面板用 F1 打开。先前被欢迎向导/快捷键阻挡的尝试没有执行 Git 写入，最终退出场景已完整通过。
- 最终 `npm run extension:test` 45/45，350.65 秒，日志 `lifecycle-extension-test.log`；包含关闭旧面板/停用后迟到确认的两项宿主 API 接缝测试，真实 Git 均无写入。lint、主前端构建与两种插件构建通过。Rust 未改，无需重跑 Cargo。

所有日志位于 `F:/Codex/work/gitviz-product/`。本批插件产物位于 `lifecycle-packages/`，仍用开发中 0.2.0 元数据，未发布商店或正式 Release：

| 产物 | SHA-256 |
|---|---|
| gitviz-0.2.0.vsix | 53221CC9ACA138854A5188475F2961ED77F601792CF8639B47EA22DBD3BE4E13 |
| fisharly-gitviz-dsh-0.2.0.tgz | DF2062C4472028707E5F25729F8557F3C566310AAFACD6B73078D63B38140709 |

这两包是本批代码，不是旧 artifacts/ 下的 0.2.0。桌面 exe 本批未重建；`process-packages/gitviz.exe` 仍不含后续写入预检及结果核对源码更新。

## 尚未覆盖与接续

只杀宿主 PID 不等于强杀整个进程树。worker 强杀/崩溃、断电仍可留下 running/锁，不自动恢复或删除锁。Linux/macOS 和远程 VS Code 未验收。DSH 本批通过真实 HTTP handler 与真实 worker，但未实机重跑插件管理页停用；VS Code 迟到确认用宿主 API 接缝测试，不能称原生 UI 证据。

下一模块是 DSH 原生停用与三端原生失败流程（hooks/权限/worktree 占用/并发），需使用当前源码构建的桌面 exe。随后推进连续节点折叠、分支/里程碑概览、围绕节点探索，再做首次使用、CI/许可证/版本和正式安装升级验收。六项顶层要求继续保持未完成，不能将本批通过等同完整公开产品交付。

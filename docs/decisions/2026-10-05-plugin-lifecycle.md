# 插件宿主生命周期

基线 main / dc43f02，工作树干净。公开交付要求在关闭/停用插件时保留已确认操作的执行与记录，且不能接受已关闭面板的迟到确认。

- VS Code 的 deactivate 最多约 5 秒，无法等待 120 秒 Git hook；不能仅返回一个长 Promise 就宣称退出保护。[宿主实现](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostExtensionService.ts)。
- 插件共有写操作在最终确认后移交单次独立 Node 执行进程，通过父子 IPC 传递服务端持有的计划，不开监听端口、不落盘请求、不使用 shell 参数拼接。worker 复用 GitService 的全部 guard、锁、超时、结果校验和持久记录。
- worker 独立于宿主生命周期，父 IPC 断开后已经收到的确认任务继续执行；完成/失败持久化后自行退出。工作区锁记录 worker PID，重新打开插件仍受同一文件锁保护。worker 被强杀/崩溃仍可能留下 running/锁，不能伪装为可自动恢复的失败。
- VS Code 每个 panel 使用有效性检查，输入/确认返回后及发送 worker 前检查 panel 和扩展仍有效；关闭旧 panel 不取消已执行的 Git。deactivate 关闭接收入口，避免发起新操作。
- DSH dispose 立即失效票据、关闭入口；请求读完 body 后再次检查，不允许跨 dispose 的迟到请求执行。正在执行的 worker 不受 HTTP 断开或插件卸载影响。
- 验证使用 F 盘合成仓库和真实进程：hook 阻塞时终止承载 worker 的测试宿主，放行后核对提交/记录/锁；停用时的延迟请求/确认不写入；两种插件包包含 worker，并在 VS Code 所用 Electron Node 模式验证启动。实际宿主 UI 行为需单独取得证据。

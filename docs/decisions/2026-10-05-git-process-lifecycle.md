# Git 命令超时与进程清理

基线 main / 30a47a0，工作树干净。本批处理 Git 命令的超时、输出上限、退出和清理；完整公开交付清单仍保留，宿主强制退出和后台脱离进程不是本批宣称已解决的内容。

- Node 统一受控命令执行器：禁用 execFile 内置单进程 timeout，超时或输出超限先终止本次创建的进程树，再等待输出关闭和清理结果。Windows 按精确 PID 使用 taskkill /T /F；POSIX 使用本次创建的独立进程组。所有参数作为 argv，禁止 shell 拼接。
- 普通命令仍为 30 秒，提交仍为 120 秒；错误区分启动失败、超时、输出上限和非零退出。输出不得悄悄截断成成功。读取 binary blob 保留 Buffer。
- Rust 写入命令保持 120 秒，但主进程退出后输出管道也受同一 deadline 限制；检查 Windows taskkill 结果，并给清理过程独立短上限。Unix 仅终止本次创建的进程组。不改变 Git hook、身份、签名或已产生的文件。
- 若进程或输出未能确认停止，明确提示进程状态不确定；写入路径保留跨宿主锁，后续写入拒绝，不能把未知状态当成可立即重试的普通失败。已终止的失败保留操作记录/检查点，可按已有继续流程处理。
- 测试只在 F 盘合成仓库：真实 hook 派生子进程、心跳/PID 停止、超时后的 HEAD/index/文件和记录、输出超限、非零退出、缺少可执行文件，以及既有写入回归。清理失败分支可以注入终止器失败，但不替换实际 Git 写入；明确区分 Windows 实测与其他平台仅实现。

依据：[Node 官方 child_process 文档](https://nodejs.org/api/child_process.html)说明终止父进程不会自动终止后代；[Microsoft taskkill 文档](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)定义 /T 作用于指定进程及其子进程。仍需等待实际关闭，不能只根据发出信号宣称成功。

# 超时恢复验收接续

目标仍为完整公开产品交付。本批基线 0a02417，原工作树干净。上一轮评价没有修改项目；本轮重新查询 CI37337489783，发现 Windows 已失败，Linux/macOS 成功，因此先处理明确的交付门禁失败，首次使用 UI 暂未修改。

## 发现和修改

- 失败位于 `tests/git-process.test.cjs` 的真实恢复超时断言，而非测试 finally 收尾。taskkill 返回 128、报告 Git/子进程已经退出；执行器按设计报告不确定并保留锁。不能仅凭返回码自动忽略清理错误。
- 测试正常路径要求 `GIT_TIMEOUT`；原生不确定路径仅接受 Windows 清理错误 128，并要求 Git/hook 父子均已退出、心跳停止、现场一致。确定性新增真实终止后注入报告失败的用例，覆盖暂停写入、跨服务锁保护和人工检查后的恢复。
- 只有测试在核对所有已知 fixture 进程停止以及 HEAD/index/文件/备份/检查点后，模拟人工处理自己的锁。拒写不得改变 refs/记录/锁/现场，恢复提交必须 parent/tree/backup/clean 正确。未终止进程保护和悬挂管道测试保留。
- 生产文件未修改；不声称消除 Windows taskkill 竞争。进程说明、P1 边界和当前接续入口已同步。

## 验证

- Windows 独立进程测试 6/6：`F:/Codex/work/gitviz-product/timeout-acceptance.log`，原生路径为 GIT_TIMEOUT，注入路径为 GIT_PROCESS_UNCERTAIN。
- `npm run lint` 与 `git diff --check` 通过。
- 完整插件回归 `npm run extension:test` 49/49 通过，日志 `F:/Codex/work/gitviz-product/timeout-acceptance-suite.log`；两条超时路径与独立运行一致。没有前端/Rust改动，不重复原生 UI 或桌面构建；三系统和打包模块由提交后 CI 验证。
- 原始失败日志：`F:/Codex/work/gitviz-product/timeout-ci-37337489783.log`。测试仓库：`timeout-acceptance` / `timeout-acceptance-suite`，均在同一 scratch 下。

下一步核对本批 CI，然后回到 P2 首次使用/可访问性。P3 最终包、其他平台原生 UI、陌生用户试用仍未关闭；本批不发布 Release，不标记总目标完成。

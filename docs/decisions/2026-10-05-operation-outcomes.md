# 操作执行结果核对

基线 main / 9b299db，工作树干净。完整公开产品目标继续；本批检查外部 Git/hook 在执行期间改变结果的可观察情形。

- 不把 Git exit 0 当作操作成功的充分条件。切换/fork 对比预期分支、目标 OID 和工作区；建分支检查新引用且原位置不变；独立 worktree 检查新目录位置且原位置不变；提交核对原分支、单一父提交、检查点 tree、工作区及备份。
- 提交前重新检查 HEAD/分支、检查点和工作文件；恢复先核对暂存树确实等于目标 tree，再允许 commit，避免将执行期间混入的文件直接提交。桌面编辑的暂存树另对照原 tree 的变更路径，只允许编辑文件。
- 核对失败时操作记录标为 failed，保留已创建提交、备份、分支、worktree、文件和暂存内容，记录实际 HEAD/分支，不做自动回滚或二次提交。
- 建立备份后重新检查原 HEAD/分支和干净状态，再恢复工作文件；使用真实 reference-transaction hook 验证备份创建期间移动 HEAD 的情形。
- Gitviz 锁不能禁止外部 Git。前后检查不是跨进程原子事务，不承诺消除所有微小竞态窗口；发现异常必须明确说明可能已有实际结果，让用户检查。
- Windows F 盘合成仓库使用真实 post-checkout/post-commit hook 制造位置/文件变化；同时验证提交前外部变化与已有恢复流程。不得修改用户仓库或全局 hooks/config。

依据：[Git hooks](https://git-scm.com/docs/githooks) 的 post-checkout/post-commit 运行时机；完成回调之后仍需核对实际状态。

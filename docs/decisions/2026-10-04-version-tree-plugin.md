# 交互版本树与插件写入边界

用户已经授权实施，2026-10-04。

- 现有 React UI 的视觉语言继续使用；新增地图组件和独立 VS Code 入口，不改变旧 Tauri 写入。
- 不复制受限 Git Graph 代码；DAG 布局自己实现，参考 MIT Neo Git Graph 的功能组织。
- Git 通过 execFile 参数数组执行，禁用交互凭据提示，不执行 shell 拼接。宿主限定已选中的本地仓库，提交参数必须为完整十六进制 OID。
- 写操作在宿主验证 trusted workspace、当前 HEAD/分支与请求快照一致，检查未提交与未跟踪文件、merge/rebase、sparse checkout。独立 worktree 不改原工作目录。
- 恢复：确认文件数与目标；保留 gitviz/backup-* 分支；git restore 目标树到 index/worktree；git commit 创建新提交。若提交因身份、hook 等失败，保留暂存内容与备份分支并明确说明，不用 reset --hard 自动清空文件。拒绝 submodule 恢复与会覆盖被忽略文件的恢复。
- 不运行针对真实用户仓库的写入测试；用 F:/Codex/work 下临时仓库。
- 发布前验收包含真实 Git 行为、VS Code Extension Host 与 Webview；仅打包不等于商店发布。

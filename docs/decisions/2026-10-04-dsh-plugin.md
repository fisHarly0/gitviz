# DSH 版本树适配

用户已授权继续 DSH。仅实现这一宿主适配，复用版本树和现有 GitService，不更改 Tauri command 或 VS Code 写入语义。

- 验证宿主：本机 DeepSeek Harness 0.2.0-rc.2，Web profile。
- 官方客户端模块工厂、外部 React、sidebar.panellist + main 插槽；插件生命周期内注册样式和 HTTP 路由，卸载释放。
- 浏览器与 Node 分离。Node 只提供显式 Git 方法，不接受任意命令。仅回环访问，校验 Host、Origin、JSON 和自定义请求头；不支持远程 DSH 部署。
- 仓库由用户在面板输入本机绝对路径；浏览器保存仓库句柄，不共享全局当前仓库。写入请求先生成有时限、绑定仓库与参数的一次性操作票据，显示实际影响，再执行。GitService 再校验 HEAD、分支和工作区状态。
- 恢复保留历史和备份分支；试验目录默认 F:/Codex/worktrees（Windows），可通过插件配置覆盖。打开试验目录指切换版本树查看该工作区，不宣称已改变 DSH 会话目录。
- 使用独立 F:/Codex/work/gitviz-dsh 的 DSH_HOME、Git fixture、浏览器数据进行实机测试。无模型调用、无真实项目 Git 写入。
- 交付本地 npm tarball；不自动发布、不提交、不改用户当前 DSH profile。

验证：宿主加载与卸载、节点预览/比较、差异、分支、worktree、恢复及取消；脏工作区、过期 HEAD、票据重放、跨来源请求拒绝；共享核心和两种宿主构建回归。

# DSH 插件

入口 extensions/dsh/index.mjs；客户端 extensions/dsh/client.jsx；构建 vite.dsh.config.js；包 @fisharly/gitviz-dsh。

API POST /_gitviz/api：open、snapshot、detail、compare、openDiff、prepare、execute。所有仓库请求携带服务端生成的 repoId；未知方法拒绝。prepare 参数仅允许 createBranch / switchBranch / createWorktree / restore，execute 仅接收一次性 token。票据 5 分钟有效，绑定预览的 HEAD 与分支，GitService 执行前再验证。响应 {result} 或 {error}。

插件配置 initialRepository（可选绝对路径）、worktreeDirectory（可选绝对路径）。默认空状态让用户选择；不读取用户凭证。写操作仅在浏览器明确确认后发出，不暴露为模型工具。

客户端复用 src/version-tree，使用 DSH 的 React 模块表；样式以 .gitviz-dsh 限定并采用宿主主题 token。用户输入和 Git 内容以 React 文本渲染。差异使用逐行变更（2 MB 单文件读取上限，更大的文本展示有界预览）。

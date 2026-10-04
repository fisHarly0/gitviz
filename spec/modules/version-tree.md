# 交互式版本树与 VS Code 插件

日期：2026-10-04。用户授权：先 VS Code、后 DSH，树状可视化、游戏化可交互节点、选择、变换和回滚。

## 本批范围与验收

- [x] 共享 DAG 布局：拓扑顺序、全部父边、多根、截断历史，选择/比较不会变更 Git。
- [x] 可交互地图：缩放、拖动、键盘选点、定位 HEAD、搜索、主线/分支定位、双节点差异。
- [x] VS Code 插件：当前工作区仓库、原生 Diff、空仓库与错误态、主题适配、受信任工作区写入限制。
- [x] 节点动作：新建分支、切换分支、独立 worktree、恢复目标树为新提交；写操作前核对状态、备份引用与用户确认。
- [x] 真实 Git 合成仓库回归：merge、dirty、删除/新增/重命名、失败、HEAD 保护、路径特殊字符。
- [x] 前端 lint/build、插件打包为 VSIX，真实 VS Code Extension Host 检查与界面截图。

本批不重构旧 Tauri 写入，不发布商店或 push。后续已完成 DSH 接入与三端大历史地图，分别见 `dsh-plugin.md`、`large-history.md`。

## 模块边界

`src/version-tree/`：宿主无关 React UI、纯 DAG 布局、请求接口。
`extensions/vscode/`：扩展入口、受信任 Git 服务、Webview 消息协议、Diff 文档、独立构建产物。

## 交互契约

图的上方为较新提交、下方为共同祖先；曲线连接真实 parent。普通点选只看详情，比较选择先选 A 再选 B。当前 HEAD 与选择光标有不同文字和视觉标记。缩放/拖动改变视口，不改变历史。恢复不是 reset：以当前 HEAD 为父提交，产生与选中提交树相同的新提交。

## 宿主接口

`request(method, params)` -> Promise；方法 snapshot、historyPage、searchHistory、detail、compare、openDiff、createBranch、switchBranch、createWorktree、restore、chooseRepo、openWorktree。UI 不传可执行命令；文件与仓库授权由宿主检查。DSH 通过其 Client slots 和 Host service 实现同一接口。桌面本地仅复用只读历史接口，其写入继续走既有 adapter。

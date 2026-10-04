# DSH 接入边界

2026-10-04。Gitviz DSH 插件 0.2.0 已实现并在本机 DeepSeek Harness 0.2.0-rc.2 Web profile 安装验证。安装包由 `npm run dsh:package` 生成。仅支持本机 Web，不宣称支持 Electron、远程 DSH 或其他预览版 API。

## 复用部分

`src/version-tree/VersionTree.jsx` 接收 `bridge`，不导入 vscode 或 Tauri。纯 DAG 布局位于 `layout.js`，支持所有父边、主路径优先、断开的根及截断边界。

`bridge.request(method, params)` 返回 Promise；`bridge.onRefresh(callback)` 可选，返回取消订阅函数。后端不能相信 Client 传来的文件路径、分支、提交和仓库标识。

| 请求 | 参数 / 结果 |
|---|---|
| snapshot | repo/name/head/branch/dirty/branches/tags/commits/truncated/limit/writable + revision/nextCursor/total/shallow |
| historyPage | cursor:{revision,offset}、limit -> commits/revision/nextCursor；无总数上限 |
| searchHistory | query、revision、cursor? -> commits/revision/nextCursor；搜索全部本机可达历史 |
| detail | oid -> commit metadata、from、to、files |
| compare | from、to -> from、to、files（status/path/oldPath） |
| openDiff | from、to、path -> 宿主比较视图 |
| createBranch / createWorktree / restore | oid、expected:{head,branch}；命名和确认由宿主负责 |
| switchBranch | name、expected |
| chooseRepo | 由宿主选择授权仓库，返回 snapshot |
| openWorktree | 仅允许打开宿主刚创建的工作树路径 |

写操作成功返回 message，可选 snapshot、worktree、head、backup；取消返回 cancelled:true。错误通过 rejected Promise 传递。writable:false 必须同时在宿主禁用写接口，不能只隐藏按钮。

## 已实现的宿主适配

Client 插件通过 sidebar.panellist/main 插槽注册，使用 DSH React。地图 CSS 在构建时加作用域，样式和路由按插件生命周期清理。VersionTree 的 hostName/busyHint 参数负责宿主文案。

Host 服务仅接收本机同源请求；仓库必须由用户输入绝对路径打开，并返回服务端句柄。写入先 prepare，再显示确认，execute 使用单次票据；expected HEAD/branch 在执行前再次验证。没有模型工具入口。具体协议见 [模块 spec](../spec/modules/dsh-plugin.md)。

本次采用面板内有界逐行 diff。仓库选择独立于 DSH 会话；打开 worktree 只改变地图，不自动切换 agent 的工作目录。切换或恢复前应先保存编辑器的未保存内容，插件只检查磁盘上的 Git 状态。

已验证插件安装、启停清理、浏览器 UI 与真实 Git 写入；报告见 [交接](../memory/handoff-2026-10-04-dsh.md)。后续若接入“会话到 Git 变更”的对应关系，须单独建立模型，不能把普通 Git 提交当作 AI 单轮改动。

参考：[DSH 主仓库](https://github.com/deepseek-ai/deepseek-harness)、[侧栏面板扩展](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar/README.md)、[UI 插件契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md)。

# GitHub 只读地图与恢复

工作区 `F:/gitviz`，main，基线 `f1cfd90`，开始时干净。公开产品 P2 子项；本批不改 Rust、远程写入、PAT 权限或本地 Git 操作。

## 已实现

- 移除旧 Gitgraph 图和依赖，GitHub 使用共享 TreeMap：真实全部父边、折叠、引用概览、已读取范围搜索、方向键选择。窗口变窄后重新定位选中节点，窄屏差异上下排列。
- 在线仍有明确边界：前 100 个分支、100 个标签、每分支 100 条；不是远程全历史分页。分支历史请求固定到本次读取的 tip SHA，最多 3 个并行，权限/额度错误停止后续排队请求。
- 统一入口/地图/详情错误，部分失败列出范围；刷新失败保留且标识旧地图。详情单独重试，取消过时请求，避免旧响应覆盖新仓库/提交。
- 远程分支和节点以“浏览基准”标识；选择分支不重复拉历史、不改变真实仓库。去掉 App 重复分支拉取，由成功历史结果更新会话。
- API 未提供 patch 时明确提示，避免空白双栏暗示无改动；Link 下一页标记文件列表不完整，提供编码后的 GitHub 原提交链接。
- README、首次使用文档同步。决策 `docs/decisions/2026-10-05-github-readonly.md`。

## 验证证据

`npm test` 31/31，`npm run lint`，三端前端 build 通过。新 `tests/github-history.test.js` 六项覆盖错误不回显请求原文、部分失败/合并父边/时钟偏差、并发上限/取消、限流停队列、空仓库与分支列表失败区分，以及真实 Octokit 映射缺失 patch/Link 下一页。没有 Rust 变更，不运行 Rust 检查。

UI 入口 `tests/github-readonly-smoke.cjs`，只连接已启动的 VS Code Integrated Browser CDP，不启动独立浏览器。设置 `PLAYWRIGHT_CORE_PATH=F:/gitviz-work/browser-check/node_modules/playwright-core`、`GITVIZ_GITHUB_EVIDENCE=F:/Codex/work/gitviz-product/github-readonly`，默认 CDP 9235、生产构建 preview 5173；参数 `fixture` 或 `live`。

- `fixture-result.json` / `fixture-final.log`：受控 401/403/404/429/断网后保留输入并重新打开，部分标签/分支错误，详情 503 后重试，缺失 patch/文件列表分页，双父合并连线，Home/End，搜索，引用 Escape 焦点返回，切换浏览分支不重复读取历史，刷新失败保留旧图和恢复。
- `fixture-1280.png`、`fixture-392.png`、`fixture-392-detail.png`：两轮视觉检查，最终无文档横向溢出，画布约 365/331px 高。窄窗口选中节点完整可见，详情需要纵向滚动。不声称物理移动设备或屏幕阅读器实测。
- `live.log` / `live-1280.png`：真实、未登录读取 `fisHarly0/gitviz`，35 个可见历史节点；已人工核对截图中的 `f1cfd9000d0b20d40c9d4e69b6444a13f9325b55` 详情及真实 AGENTS.md patch。这轮 JSON 的 remoteOid 为空，因为选择器错误命中了 skeleton；修正为排除 skeleton 并强制断言 40 位 SHA，不能用旧 JSON 中空值宣称断言通过。
- 加强断言后的 `live-final.log` 未通过：真实 GitHub 未登录额度已用完，入口正确显示限流提示，见 `live-rate-limit.txt/png`。不循环冲击 API。最终真实详情复验待额度恢复；受控测试不冒充真实权限或完整在线验收。
- 初次复用旧隔离 Code profile 出现 ERR_FAILED 工作台资源加载失败。改为本批全新 profile 后正常；第一轮新 profile 在工作台就绪前发送命令超时，脚本补等待。fixture 最初缺少 CORS 暴露 Link 导致分页断言失败，补齐模拟响应后通过。没有因此改变生产分页检测。

测试 scratch 是上述证据目录；Code profile/extensions 位于其子目录。所有 API 故障数据均为 fixture，不使用真实私有仓库或访问令牌。未在真实仓库执行 Git 写入测试。构建为源码前端验证，没有生成或发布本批桌面安装包/VSIX/DSH 包。

收尾已核对 PID 和命令行后停止自己的测试 Code 46252、preview 49252；这不作为正常退出验收。初始失败的旧 profile Code 24312 同样已核对后停止。证据文件和隔离 profile 保留。

## 接续

完整公开产品目标未完成。额度恢复后先重跑加强后的 live 详情验证，不重复已通过的受控故障和地图大历史测试。再核对 P1 累积证据、剩余可访问性和最终发行包；Linux/macOS 原生 UI、陌生用户试用仍未验证。

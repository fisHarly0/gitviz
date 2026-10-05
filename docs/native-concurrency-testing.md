# 三端同时操作同一仓库

`tests/native-concurrency-smoke.cjs` 使用真实 Tauri 窗口、已安装 VSIX 和 DSH Web 插件，对同一合成仓库执行三轮恢复。写入通过各自界面的正式确认；不替换 Git、后端或宿主消息。

| 写入者 | 写入期间确认另一请求 | 写入结束后确认旧预览 |
|---|---|---|
| 桌面 | VS Code | DSH |
| VS Code | DSH | 桌面 |
| DSH | 桌面 | VS Code |

每轮先在三端预览同一目标，再确认写入者；真实 pre-commit hook 暂停提交时，确认第二端。测试核对拒绝后锁持有者 PID、HEAD、引用、index 字节、工作文件和全部操作记录均不变。放行 hook 后检查唯一新提交的父关系、目标 tree、备份和清洁状态。第三端的旧确认随后也必须拒绝，不能增加记录或改变仓库。三端刷新后显示新 HEAD，并展开同一编号的完成记录。

桌面会在取操作锁之前检查历史版本。恢复创建备份引用后，它可先报“历史已变化”；此次原生流程证明该提前拒绝及不变量，不声称该请求已经触达 Rust 文件锁。VS Code/DSH 在这个场景报锁占用。结果保留各端的实际错误文本。这些检查只约束 Gitviz，自行运行的外部 Git 不受该锁限制。

另一个回归场景让 DSH 在 hook 中等待，桌面先刷新并读到“进行中”；随后 hook 失败，HEAD 与 Git history revision 均不变。桌面再次“刷新历史”必须读到同一记录“未完成”。移除测试 hook 后由桌面继续提交，核对 parent/tree/backup/clean，并在三端显示同一完成记录。这覆盖历史快照与操作日志独立变化的情况。

## 运行方法

需要 PowerShell 7、Git、Node、已有 Playwright Core、VS Code 和 DSH 0.2.0-rc.2 Web，以及同一已核对版本的桌面程序和插件包。使用隔离配置，不连接日常窗口或仓库。

1. 指定尚不存在的 `GITVIZ_CONCURRENCY_ROOT`，运行 `node tests/native-concurrency-smoke.cjs setup`。它生成 25 条历史、`fixture.json`、两套关闭自动更新与信任提示的 VS Code 测试配置。
2. 将待测 VSIX 安装到该目录的 `vscode/extensions`，使用 `vscode/profile` 启动 VS Code，打开 `fixture.json` 的 `root`，CDP 端口为 9235。另用 `browser/profile`、`browser/extensions` 启动独立 VS Code 窗口，端口 9236，仅承载 Integrated Browser。
3. 用官方 CLI 在独立 DSH_HOME 中安装并启用待测 tarball，然后启动 `dsh --profile web --no-open --host 127.0.0.1 --port 3087`。stdout 保存到测试根目录的 `dsh.log`。设置 `GITVIZ_CONCURRENCY_DSH_HOME` 为此 home；不要打印日志里的登录 URL。
4. 启动待测桌面 exe，`WEBVIEW2_USER_DATA_FOLDER` 指向测试目录的 `webview`，`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9348`。
5. 设置 `PLAYWRIGHT_CORE_PATH`，运行 `node tests/native-concurrency-smoke.cjs run`。脚本自行打开 Gitviz 面板、Integrated Browser 与仓库，使用全历史搜索定位节点。运行结束关闭自己的宿主；停止 DSH 前确认合成仓库没有活动操作锁。

脚本只连接原生宿主的 CDP，不启动独立 Chromium。`setup` 拒绝已有根目录；`run` 拒绝已经产生操作记录或提交的 fixture。部分写入后必须换新 fixture，不 reset 现场再报通过。失败时保留截图、文本和原仓库；finally 放行自己的 hook 并等待锁释放，然后移除测试 hook。测试应用生命周期仍由启动者负责。

输出 `result.json`（三轮并发及相同 Git revision 回归全部完成才 `passed=true`）、九张 `round-*-*.png`、三张 `final-*.png` 和 `served-client.json`。DSH 启动清单实际提供的客户端资源需与安装代码一致；桌面 SHA 与插件逐文件包校验另行保存在 `identity.json`。

2026-10-05 已在 Windows、VS Code 1.131.0、DSH 0.2.0-rc.2 Web 完成全部场景。证据位于 `F:/Codex/work/gitviz-product/native-concurrency-030/`，最终日志 `run-fixed-ready.log`。插件使用 CI `51a873c` 的 0.3.0，桌面重建包含本批记录刷新修复；旧 CI 包不包含此修复。此前失败尝试的仓库和证据独立保留，不计入通过。收尾确认无锁和未完成写入后关闭测试进程，四个端口已释放；本批不作为正常关闭行为的验收，具体见 [并发交接](../memory/handoff-2026-10-05-native-concurrency.md)。

# 三端原生失败流程

`tests/native-failure-smoke.cjs` 使用实际安装的 VS Code / DSH 插件或当前源码构建的 Tauri 程序，通过产品界面操作合成仓库，不替换 Git、扩展消息或后端响应。

## 场景与断言

| 场景 | 需要证明的行为 |
|---|---|
| 目标分支被另一个 worktree 使用 | 原生确认后 Git 拒绝切换，界面显示错误；HEAD、分支与文件保持原样，记录失败 |
| 确认后出现 `.git/index.lock` | 恢复失败；原 HEAD、index 字节和文件保留，备份仍指向原位置，无无效续交检查点 |
| Windows refs 目录真实权限拒绝 | 使用仅限合成仓库的 ACL 产生 Git Permission denied；不改变文件/HEAD，不提供无效续交，随后恢复原 ACL |
| pre-commit hook 拒绝提交 | 错误可见；保留目标文件、暂存 tree、备份及有效检查点 |
| 取消继续、修复 hook 后继续 | 取消不增加尝试次数；继续后父提交、tree 和备份正确、工作区干净，成功记录可见，临时旧错误消失 |

桌面切换失败后的旧错误曾在恢复成功后残留。当前分支栏按仓库及成功恢复 revision 重建；持久操作记录仍保留失败详情，不在失败后仅因 HEAD 变化而隐藏异常。

## 运行

先按 [桌面测试](desktop-testing.md) 或 [插件测试](host-testing.md) 准备隔离 profile、当前安装包和 CDP。三端串行运行，避免连接日常窗口。测试环境需要 Git、已有 `playwright-core`，Windows 权限案例还需要 Windows PowerShell。

```powershell
$env:GITVIZ_DESKTOP_TEST_ROOT='F:\Codex\work\gitviz-product\native-failure-tests'
$env:PLAYWRIGHT_CORE_PATH='F:\gitviz-work\browser-check\node_modules\playwright-core'
$env:GITVIZ_TEST_HOST='desktop' # 或 vscode、dsh
node tests/native-failure-smoke.cjs
```

桌面默认 CDP 9248，插件默认 9235；`GITVIZ_CDP_URL` 可覆盖。DSH 页面使用本机 3087。VS Code 额外指定 `GITVIZ_HOST_FIXTURE`，内容为 `{root, first}`，指向已在其隔离窗口打开的 25 提交合成仓库；目录必须在上述 scratch 内。桌面和 DSH 自行创建新仓库。失败后不要复用已变更的 fixture 重跑。

Windows ACL 辅助脚本只接受 scratch 内仓库及备份路径，先保存原权限再加临时拒绝规则，finally 恢复。Node 子进程会清除继承的 `PSModulePath`，避免 PowerShell 7 的模块路径污染 Windows PowerShell。测试进程若被强杀，先按 scratch 内对应 `*-refs-acl.txt` 恢复该测试仓库权限；该文件不含项目内容，不应提交。

结果为 `native-failure-{host}.json` 和同名 PNG。桌面打开仓库使用合成拖放事件，不代表原生文件夹对话框验收；Windows ACL 证据不代表其他系统权限验证。

## DSH 原生停用

在已安装并启用开发包的隔离 DSH 页面运行 `node tests/dsh-lifecycle-smoke.cjs`。脚本确认恢复、等待真实 hook、通过插件管理页关闭 Gitviz，验证侧栏及样式释放、独立进程在停用后完成、锁释放，再启用并读取完成记录。不会调用模型或改变 DSH 会话工作目录。

`dsh-lifecycle-native.json` 与 `dsh-disabled-worker-completed.png` 保存结果。仅关闭插件不等于杀死执行进程；强杀进程树、断电或进程崩溃仍可能留下现场，见 [插件关闭边界](plugin-lifecycle.md)。

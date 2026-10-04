# 大历史地图交接（0.2.0）

2026-10-04。用户授权桌面本地、VS Code、DSH 完整浏览 2000+ 提交，并询问点选是否改变真实仓库。工作区 F:/gitviz；基线 HEAD f5a0511。接手时已有大量未提交修改，均保留；本批不提交或推送。

## 行为

- 点击节点只选择预览；不切换仓库目录、HEAD 或工作文件。插件明确的切换/恢复仍经过已有确认；DSH 打开 worktree 仅切换地图对象，不改变 DSH 会话目录。
- 默认首批 300，逐批/连续加载与停止；全部本机 heads/remotes/tags/HEAD 可达历史无总条数截断。浅克隆提示，不自动联网 fetch。
- 全历史搜索标题、作者、OID、引用名，独立分页；选结果后逐批读取到目标并定位。历史变化报错要求刷新。
- 完整 DAG 元数据保留，节点与连线按视口裁剪；长边跨视口仍显示。堆排序改善拓扑布局，键盘可越过未挂载节点。
- 桌面本地采用共享地图与横竖视图；保留既有详情/编辑/导出。GitHub 在线模式走 LegacyCommitGraph，未扩容。桌面需要系统 Git，原有 gix 写入仍属实验性实现。

## 文件

共享 UI：src/version-tree/{useHistoryPaging.js,HistoryControls.jsx,TreeMap.jsx,viewport.js,layout.js}。桌面封装：src/components/CommitGraph.jsx、desktop-history.css、src/adapters/tauriAdapter.js。只读 Rust 命令：src-tauri/src/commands/history.rs。Node GitService 由两个插件复用；宿主白名单新增 historyPage/searchHistory。

Windows Rust 搜索停止时必须先关闭 stdout reader，再终止 Git launcher，否则其子进程可能堵在管道写入、stderr join 永不结束。本批真实分页搜索测试发现并修复。stderr 持续排空但只保留 8 KB 诊断。Tauri 字符串错误在 adapter 转为 Error，使过期分页提示正常显示。

## 验证证据

所有路径下文相对 F:/Codex/work/gitviz-large-history。

- tests/large-history.test.mjs：真实 fast-import 2000/5000/10000，数量、去重、全父边与独立 git rev-list 比对；最早提交/hash/ref 搜索，结果分页，旧 HEAD 首批边界不漏提交，过期/跨库 cursor；浅克隆及 unshallow 失效；双端在视口外的长边。
- report.json：本机 Node 首批约 0.6–0.7 秒；读取全部约 1.7/3.3/5.9 秒；10000 布局约 28 ms、测试视口 12 节点。仅合成仓库单机测量，非性能承诺。
- cargo-test-fixed.log：Rust 2000/5000/10000 分页与搜索分别约 3.7/4.9/7.5 秒，全部通过。首次编译器内部崩溃，通过单 worker、RUST_MIN_STACK=33554432 完成编译；不改依赖版本。
- vscode-result.json / vscode-10000.png：实际 VS Code 1.131 隔离配置，逐批、停止、最早结果定位、10000 全载、跨视口键盘，HEAD/status 不变。
- dsh-result.json / dsh-10000.png：实际 DSH 0.2.0-rc.2 Web，插件管理 UI 安装最终 tarball 后重启服务，10000 同流程通过。使用隔离 VS Code Integrated Browser；未启动个人浏览器、未使用模型或密钥。
- desktop-result.json / desktop-10000-{vertical,horizontal}.png：真实 Windows Tauri release + WebView2，10000 全载、最早提交搜索、停止、横竖定位与键盘通过；HEAD/status 不变，无页面错误。过长搜索字符串的 Rust 错误显示正常。
- 前端 lint/build、VSIX/DSH 打包通过。Impeccable detector 运行一次，只有原有错误色 fallback 与移动端 9px 字号两项 advisory，无阻断；设计 sidecar 有接手前的文档同步提示，本批未重写设计档案。
- 最终插件包复测：VS Code 重新安装 0.2.0 后通过同一 10000 UI 流程；既有前端测试 10/10、Git/布局 19/19、DSH 集成 4/4。并行进行桌面编译时曾发生系统内存不足，连带一轮 Git spawn 失败；停止编译后的 DSH 单独复测全部通过，未放宽断言。

## 边界

更大于 10000 的规模尚未实测；目前保留全部提交元数据和布局，每次分页仍重新布局，超大仓库还有优化空间。Rust Git 命令尚无统一超时。仅本机可达历史，不含未 fetch 的远程提交或不可达对象。桌面 UI 使用合成 tauri://drag-drop 事件进入既有打开仓库流程；真实应用 handler 与全部 IPC/Rust 未模拟。原生文件选择框未自动化验证（invoke 为不可替换属性），测试没有修改生产权限或增加测试后门。

DSH 更新包后必须重启服务以刷新 Node 模块缓存；只替换客户端会出现新地图配旧 snapshot、没有分页按钮的情况。测试 profile 与服务均在 F:/Codex/work/gitviz-dsh，用户日常配置保持不变。

## 最终交付

- artifacts/gitviz-0.2.0.exe、gitviz-0.2.0.vsix、fisharly-gitviz-dsh-0.2.0.tgz，以及各自 .sha256。旧 0.1.0 插件包保留。
- npm run desktop:build -- --ci 构建成功（desktop-build-final.log），使用 CARGO_HOME=F:/dev/cache/cargo、CARGO_BUILD_JOBS=1、RUST_MIN_STACK=8388608、RAYON_NUM_THREADS=2。此前内存不足退出，通过关闭本次隔离测试服务后成功，未关闭用户日常应用或修改依赖。
- 测试进程已关闭；证据保留 F 盘。最终共享 UI detector 两项旧 advisory 保留，不再重跑扫描。未提交、未推送、未发布商店；如需上传，应先区分本批与接手前修改。

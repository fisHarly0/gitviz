# 桌面编辑器离线资源

基线 6e25171。EditorPanel 直接懒加载 @monaco-editor/react，没有配置 loader；已安装 loader 的默认地址为 jsDelivr 上的 Monaco 0.55.1。应用本身已安装并不代表首次编辑可离线启动。

采用依赖自带 README 的 Vite ESM 配置：显式锁定现有 Monaco 0.55.1，懒加载本机打包模块，注册 editor/JSON/CSS/HTML/TypeScript workers，向 React loader 注入同一 Monaco 实例。无需运行时 CDN，不影响 GitHub 在线功能和其他两端的宿主编辑器。保留现有语法语言、草稿与保存流程。

验证计划：前端构建/测试/lint，Rust check 与桌面 release 重建；全新隔离 WebView2 数据目录，阻断外部网络后首次打开、编辑、确认取消与保存，检查真实 Git 身份/内容/parent/index；验证 JS/JSON 等 worker 从打包资源运行。重启后仍能读取已保存内容。只使用 scratch 合成仓库，不修改用户仓库或全局网络设置。

构建默认值：本机 Vite 原生转换在默认线程栈下退出，采用 CI 已有的 8 MiB RUST_MIN_STACK / 2 个 Rayon 线程后通过。`scripts/vite.mjs` 在加载 Vite 前提供这两个默认值，保留用户显式设置；用于 dev/build，不设置系统环境。大型编辑器模块仍按需加载，增加本地包资源体积，不把大 chunk 警告隐藏掉。

许可：Vite 从锁定的 Monaco 包原样生成 `licenses/monaco-editor/LICENSE.txt` 和 `ThirdPartyNotices.txt`，随桌面静态资源嵌入；缺少源文件直接令构建失败。验证构建资产的 SHA 与包内原文一致，并在原生程序中请求这两个本地资源。

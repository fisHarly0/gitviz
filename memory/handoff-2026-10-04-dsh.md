# DSH 版本树交接

用户“DSH继续”授权实现第二宿主。本轮只做 DSH adapter；F:/gitviz，main，保留所有接手前未提交变更，没有 commit/push/publish。

## 实现

- extensions/dsh 是 @fisharly/gitviz-dsh 0.1.0 npm bundle。index.mjs 注册本地 HTTP carrier，host.mjs 处理仓库句柄、差异、一次性确认、写操作。复用 extensions/vscode/git-service.cjs，在 build 时复制到 dist。
- client.jsx 通过官方 sidebar.panellist/main 插槽注册；React、jsx-runtime 由 DSH 模块表提供。styles 在 apply 的 effect 中安装并随卸载清理。vite.dsh.config.js 自动作用域化地图 CSS，避免污染 DSH。
- VersionTree 新增 hostName/busyHint，CSS 改由宿主入口导入；默认仍为 VS Code。旧 Tauri 和 VS Code Git 后端未改。
- 选择仓库为输入绝对路径；同浏览器标签页会话记住最后选择，不改变 DSH 对话 workspace。打开试验工作区只改变版本树，UI 明示。
- Git 写入准备与执行分离。5 分钟票据绑定 repoId/action/oid/name/expected，单次有效；执行仍检查 HEAD、分支、dirty、操作中标记等。
- API 仅接受 loopback + Host/Origin 匹配 + JSON + 自定义头。没有模型工具、没有模型调用；不支持远程 DSH 或 Electron。
- 确认弹窗使用原生 dialog（焦点圈定、Escape 取消）；逐行差异有字数、算法时间、行数上限。深浅主题使用 DSH token；窄窗口检查器下移。

## 验证

本机 DSH 0.2.0-rc.2，隔离 DSH_HOME=F:/Codex/work/gitviz-dsh/home。由真正插件管理界面安装 tarball → 立即启用；升级重启后测试。

- 4 个 DSH HTTP/Git 集成测试通过：跨来源和坏 Host 拒绝、方法白名单、无预写/票据绑定/重放拒绝、过期票据与 dirty/过期 HEAD、真实 diff/restore/worktree/switch。
- 10 条 Playwright Chromium 实机 UI 路径通过：加载合并图、预览不写入、diff/双节点比较、取消恢复、分支/切换、独立 worktree、恢复 tree OID 一致、dirty 禁用、跨面板保留仓库、主题和窄窗。浏览器 pageerror 为零。
- 实际停用/启用：侧栏和样式消失，API 不再返回 200；重新启用仅一个样式节点，恢复仓库。开关测试需等 aria-checked 更新后再点击，避免连续两次点击旧 UI 状态。
- DSH UI 未配置任何真实模型 key；启动后的模型配置提示选择“稍后配置”。
- npm run extension:test 19/19；npm test 10/10（含重复的 6 个布局测试）；npm run lint、npm run build、npm run extension:build 均通过。
- 截图：1440×960、900×850、600×850 Chromium 合成视口；暗色使用宿主 data-ds-dark-theme token 属性切换，等待 CSS 过渡结束。没有实体触屏、Safari/macOS、Electron 验证。
- 外部日志、fixture、浏览器自动化脚本和报告在 F:/Codex/work/gitviz-dsh；测试 Git fixture 在 F:/Codex/work/gitviz-tests。没有在真实用户项目做 Git 写入。

## 交付与继续

`npm run dsh:package` → artifacts/fisharly-gitviz-dsh-0.1.0.tgz。插件无依赖安装脚本，无新增生产依赖；打包携带 GitService、jsdiff 许可及插件 MIT 许可，不打包第二份 React。readme/locale/icon/patch 完整。

最终包 SHA256：`A41E5C0D8A058FDC97C84E6736B226685C118A9C9AF74294059A9D07373C758D`。最终包再次通过插件管理界面安装，逐文件核对 source/installed 相同，重启 DSH 后再次验证面板、9 个真实节点、保存的仓库选择及 diff。测试服务器和浏览器已关闭。

PostCSS 8.5.14 从 Vite 的既有依赖明确列为 devDependency，用于构建时 CSS 作用域处理，避免依赖包管理器的隐式提升。

进入 DSH → 插件 → 添加插件，填本地包绝对路径；安装后立即启用。重复安装同版本需卸载旧包并重启 DSH。用户日常 profile 未被修改。

已知边界：历史 300 个节点；大 diff 有界预览；不接管 DSH 编辑器未保存缓冲区，切换/恢复前需先保存编辑器内容。Git hook 或签名失败保留备份及暂存修改，遵循既有 GitService 行为。DSH 预览 API 后续版本需重新验证。

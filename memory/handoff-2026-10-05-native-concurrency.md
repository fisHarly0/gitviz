# 接续：三端原生并发与桌面记录刷新

F:/gitviz，main，基线 0ee1c38，接手时干净。用户持续授权公开产品完善与提交/push；完整清单 `spec/modules/public-product.md` 保持未完成。此前工程交付/升级历史见 delivery-pipeline 交接。

## 本批结果

- `src/App.jsx` 的 OperationHistory refreshKey 改为实际 repoSnapshot 对象。此前“刷新历史”只更新地图/HEAD，已展开的外部操作记录仍可能停在 running；现在每个新快照都会重读日志，包括相同 HEAD/history revision。原 blocked 和仓库隔离不变；未改 Rust 或 Git 写入语义。
- 新增 `tests/native-concurrency-smoke.cjs`，setup 创建隔离配置与 25 提交 fixture，run 连接桌面9348、VSCode9235、承载 DSH 的独立 VSCode9236及DSH3087。三轮轮换写入者/占用时竞争者/完成后旧确认者，真实 UI 确认，真实 hook 暂停。检查拒绝前后锁PID、HEAD/refs/index/文件/操作记录不变；完成后parent/tree/backup/clean正确，三端同一完成记录。
- 第四场景：DSH hook running 时桌面读记录，放行后hook失败；HEAD/revision相同，桌面刷新应读同一failed记录，再经UI继续提交。最终四条记录均completed，最后一条attempts2；Git工作区干净。三端最后实际HEAD `fa48c8f02019c37e8a6634f40a41b439652a7503`，失败/继续记录ID `01a10b7e66eb-4f12ed561cd04d389638c57dfca14340`。
- 桌面提前检查revision，所以DSH已建备份时，桌面在锁检查前以“历史已变化”拒绝。精确接受此安全路径并保留错误文本，不冒称此请求触达Rust文件锁；两个插件仍验证真实锁拒绝。

## 证据与验证

根 `F:/Codex/work/gitviz-product/native-concurrency-030/`。最终 `run-fixed-ready.log` exit0，result.json passed=true，三轮PNG与final三端PNG已查看。identity.json核对插件全部安装文件（VSIX12、DSH16）与CI包；served-client.json核对DSH实际加载代码。

- 宿主：Windows，VS Code1.131.0，DSH0.2.0-rc.2 Web。两个插件为CI51a873c的0.3.0，DSH_HOME复用此前完全隔离的 `dsh-upgrade-030/home`，无模型调用/日常配置。
- 桌面重建 `gitviz-fixed.exe` SHA256 `1e40060fb74a7d7678ca32a2cc86c1af778d25ea6331888089445062017745cc`。生产唯一修改为App.jsx；构建前已改好，之后只改测试/文档。不能把旧CI51a/0ee的安装包当作包含此修复。
- npm test25/25、lint、`npm run desktop:build -- --ci`通过，含前端build；原生编译1m40s。Rust源码未变，没有额外机械重跑Rust测试。
- 早期测试先误用“刷新”按钮名，再假设虚拟化节点一直挂载，改为真实搜索定位。原先只期待锁错误，桌面提前revision拒绝导致fixture hook超时，失败现场保留。随后严格核对同一记录ID发现真正的桌面日志刷新bug，修复并换新fixture完整复验。目录 first-attempt/second-attempt/before-product-fix 保留此前证据；没有reset后冒充新测试。
- 0ee1c38 / CI37291219864三系统全部success。下载 `delivery-ci-install-0ee1c38`，首次安装/重装的字节校验均只存在UNK→NSS，安装结果成功。raw SHA bad85e…与安装SHA241f9a…属于该次新构建，不能套用51a产物SHA。

## 收尾与下一步

所有Git操作结束、锁释放后清理自己的应用。桌面CloseMainWindow两次请求未退出，VSCode File→Exit也未结束主进程；没有假称正常关闭。核对PID/可执行路径或隔离profile命令行后终止自己的桌面24700（旧版6608先已停）、VSCode36228/31136、DSH36412；9235/9236/9348/3087已无监听。测试不修改日常窗口，正常关闭既有验收不由本批替代。

本批提交/push后跟踪新CI（包含桌面生产修复）。下一模块P2首次使用：当前桌面仍混有英文、缺少Git需明确自助恢复、首屏/仓库与实际HEAD说明；读取相关UI skill后实现和实测。P1顶层需按已有真实证据做最后逐项审查，P3支持平台/其他平台原生UI/最终打包尚未完成。原生产偶发未知清理根因仍未查明，不因数轮CI通过而宣称修复。不要重复已完成的安装升级或三轮并发来替代剩余工作。

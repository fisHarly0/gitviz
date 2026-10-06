# Gitviz

**把 Git 历史变成可探索的存档地图：看版本、比较变化、开一条试验路线，再回到原进度。**

支持 Windows 桌面应用、VS Code 插件和 DeepSeek Harness（DSH）Web 插件。浏览器入口用于只读查看 GitHub 仓库。

当前为 **0.3.0 开发版，尚未正式发行**。旧 0.2.0 包不包含后续修复，请按对应源码构建。安装、升级与支持范围见 [工程交付说明](docs/delivery.md)。

[第一次使用](docs/first-use.md) · [VS Code](extensions/vscode/README.md) · [DSH](extensions/dsh/README.md) · [构建与发行](docs/delivery.md) · [问题反馈](https://github.com/fisHarly0/gitviz/issues)

## 能做什么

- **浏览大历史**：逐批读取本机可达提交，搜索说明、作者、提交编号与引用；折叠连续历史，定位分支和标签，围绕节点探索父子关系。
- **看清当前位置**：区分实际 HEAD 与预览节点。点选、搜索、折叠和比较都不改写工作文件。
- **从一个版本开试验**：创建独立 Git worktree，保留原仓库的未提交进度。
- **保留历史地恢复**：先建备份引用，再创建内容对应目标版本的新提交；不会删除后续历史。
- **检查失败与继续提交**：持久操作记录保留起点、备份和错误；符合检查点的失败提交可以重新确认并继续。

| 入口 | 浏览与比较 | 修改与试验 |
|---|---|---|
| Windows 桌面 | 本机历史、搜索、横竖地图、文件差异 | 建分支、切换、独立 worktree、恢复、受保护的文本编辑与试验分支导出 |
| VS Code | 共享版本树、双节点比较、原生 Diff | 建分支、切换、独立 worktree、恢复；试验在新窗口打开 |
| DSH Web | 共享版本树、双节点比较、面板内 Diff | 同类 Git 操作；地图仓库独立于 DSH 对话工作目录 |
| GitHub 在线 | 有数量限制的远程历史与差异 | 只读，不支持编辑或导出 |

![DSH 浏览 10000 条合成提交历史，定位最早存档](docs/images/gitviz-dsh-10000.png)

上图为大历史浏览验证截图；当前开发版另包含历史折叠、试验返回与失败恢复入口。

## 查看存档 → 开试验 → 返回

1. **打开仓库**：桌面粘贴完整路径后按 Enter、选择文件夹或拖入目录；插件在各自入口选择本机仓库。
2. **选择节点**：查看提交说明和文件变化。单个节点的差异以父提交为基准；合并以第一个父提交为基准，首次提交以空版本为基准。
3. **比较位置**：VS Code / DSH 可点击“与实际位置比较”，查看 HEAD 到所选版本的差异，不包含未提交修改。“返回实际位置”结束预览，不执行 Git 切换。
4. **从这里试一版**：确认新分支、目录和影响后，创建独立工作区。原仓库的工作文件与未提交进度保留。
5. **打开与返回**：桌面 / DSH 在地图中打开试验后，可“返回上个仓库”；VS Code 保留原窗口并另开试验窗口，切回原窗口即可。返回不删除试验目录，也不撤销其中的修改或提交。

桌面 / DSH 的返回记录仅在本次界面会话保留，重载或重新启动后可通过仓库选择器再次打开。DSH 地图选择不会改变对话工作目录。

桌面编辑旧存档前会确认创建并切换试验分支；在 `if-` 试验分支的当前位置也可直接编辑。“保存并提交”使用实际 Git 身份、钩子和签名。未完成编辑时，切换仓库和返回受导航保护。

## 大量提交如何处理

默认首批 **300 条是每批数量，不是历史总数上限**。可逐批加载，或连续加载到末尾，随时停止。搜索覆盖尚未加载的本机可达提交，地图只绘制视口附近的节点。

已验证含分叉、合并的 **2000 / 5000 / 10000 条真实 Git 历史**，Windows 三端也完成 10000 条原生界面浏览验证。更大规模尚未实测，已加载元数据仍驻留内存。

历史范围包括本机分支、远程跟踪引用、标签及 HEAD 可达提交；不会自动 fetch，浅克隆会明确提示。GitHub 在线模式复用版本地图，支持合并连线、折叠、已读取范围搜索和键盘选择；最多读取前 100 个分支、100 个标签及每个分支最近 100 条提交，不代表完整远程历史。远程分支只是浏览基准，点选不会切换本机仓库。

折叠、引用查找和附近探索的用法见 [长历史探索](docs/map-exploration.md)。

## 安装与启动

当前提供源码构建流程及指定提交的 [Actions 验证产物](https://github.com/fisHarly0/gitviz/actions/workflows/ci.yml)，尚未发布正式 Release 或扩展商店版本。验证包不等同于正式支持承诺。

最新固定验证构建为 [`486dae3` / CI 37484149175](https://github.com/fisHarly0/gitviz/actions/runs/37484149175)。在运行页的 Artifacts 中下载对应平台包，再按 [产物清单](docs/releases/0.3.0-validation-486dae3.json) 核对文件名和 SHA-256。Actions 产物保留 14 天；过期后需按该提交自行构建。

本地三端都需要 Git；先检查 `git --version`。从源码构建需要 Node.js 20.19+（20.x）或 22.12+，开发环境以 [.node-version](.node-version) 为准。桌面另需 Rust 与系统原生工具链，见 [Tauri 环境要求](https://tauri.app/start/prerequisites/)。Windows 桌面运行需要 WebView2。

在仓库根目录安装依赖：

```bash
npm ci
```

### Windows 桌面

```bash
npm run desktop:dev
# 或构建免安装程序
npm run desktop:build
```

免安装程序输出到 `src-tauri/target/release/gitviz.exe`。NSIS 安装程序的构建、校验和安装验证见 [工程交付](docs/delivery.md)；安装、重装、卸载及旧免安装版升级衔接已有验证，最终发行验收仍在进行。未提供 MSI。

### VS Code 插件

```bash
npm run extension:package
```

在 VS Code 执行“扩展: 从 VSIX 安装”，选择 `artifacts/gitviz-0.3.0.vsix`。打开仓库后，在命令面板执行 **Gitviz: 打开交互式版本树**。详情见 [插件说明](extensions/vscode/README.md)。

### DSH Web 插件

```bash
npm run dsh:package
```

适配 **DeepSeek Harness 0.2.0-rc.2 Web profile**，宿主需要 Node.js 22.12+。在 DSH“插件 → 添加插件”中填入 `artifacts/fisharly-gitviz-dsh-0.3.0.tgz` 的绝对路径，安装并启用后打开“Gitviz 版本树”。

更新插件后需要**重启 DSH 服务**，只刷新网页不足以更新后端模块。仅支持本机回环地址的 Web profile；远程部署和 Electron 暂不支持。详情见 [DSH 说明](extensions/dsh/README.md)。

### GitHub 只读网页

```bash
npm run dev
```

打开终端显示的地址，输入 `所有者/仓库名` 或 GitHub 仓库网址。公开仓库通常不需要令牌；私有仓库需要有读取权限的令牌。令牌只在浏览器允许会话存储时保留于当前标签页。

网页与桌面开发模式共用端口 5173，请勿同时启动。网页不支持本机文件夹或 GitHub Enterprise 地址。

## Git 操作与失败处理

**切换、恢复、编辑会修改真实仓库，执行前会说明影响并要求确认。** 建分支保留当前文件；独立 worktree 在另一个目录展开目标版本；恢复创建新提交与备份。

写入前后会检查仓库位置、历史版本、工作区及操作结果。未提交修改、过期确认、其他 worktree 占用和进行中的 Git 操作等情况会阻止不适用的动作。外部 Git 工具不受 Gitviz 的锁控制。

提交失败后先展开“操作记录与恢复”（桌面存档操作失败提示可直接进入），检查实际 HEAD、备份和保留的文件；修复身份、签名或钩子问题后，按检查点重新确认继续。失败不一定意味着没有创建提交，不应直接删除锁或强制重置。

| 需要了解 | 文档 |
|---|---|
| Git 无法启动、路径错误、首次使用 | [打开与排错](docs/first-use.md) |
| 失败提交、备份与继续操作 | [恢复说明](docs/operation-recovery.md) |
| 写入前限制与结果核对 | [写入前检查](docs/write-preflight.md)、[执行结果](docs/operation-outcomes.md) |
| 正常关闭、宿主退出与超时 | [桌面关闭](docs/desktop-close.md)、[插件生命周期](docs/plugin-lifecycle.md)、[进程处理](docs/git-processes.md) |
| 三端同时打开同一仓库 | [并发验证](docs/native-concurrency-testing.md) |
| 安装与升级 | [升级说明](docs/upgrade-testing.md) |

桌面导出的试验分支 ZIP 包含 Git loose objects、引用与导入说明。解压后按包内 `README.txt` 使用 `git fetch <解压目录> <导出分支>:<新本地分支>` 导入。

## 当前验证与限制

- Windows 原生桌面、实装 VS Code 和 DSH 已验证大历史浏览、试验创建/返回、典型写入失败和恢复；测试使用合成仓库。
- Windows、Linux、macOS 的 CI 执行检查、真实 Git 测试及构建。Linux/macOS 原生界面仍未完成验收，CI 成功不等于全平台 UI 已验证。
- GitHub 只读入口已验证真实公开仓库读取，以及受控网络/权限/限流错误后的重试；全面可访问性审查、陌生用户试用和最终发行包验收仍未完成。
- 强制终止、崩溃或断电可能留下未完成操作与锁；无法确认 Git 进程停止时会保守阻止继续写入。
- 尚未提供通用撤销、拖动节点改写历史、merge/rebase/cherry-pick 可视化操作或跨会话试验导航。
- 旧 0.2.0 桌面包保留早期实验性写入行为；本文中的保护和流程以当前开发源码为准。

具体完成项和缺口见 [公开产品验收清单](spec/modules/public-product.md)，版本差异见 [0.3.0 发布说明草稿](docs/releases/0.3.0.md)。

## 开发

React + Vite 提供界面；三端共享版本地图。桌面使用 Tauri 2，Git CLI 执行本地历史与受保护写入，Rust gix 读取提交详情和导出。VS Code / DSH 共用 Node Git 服务。

```bash
npm run lint
npm test
npm run extension:test
npm run dsh:test
npm run history:test
npm run build
```

完整的 Rust 检查、版本同步和打包门禁见 [贡献指南](CONTRIBUTING.md) 与 [工程交付](docs/delivery.md)。

| 目录 | 用途 |
|---|---|
| `src/version-tree/` | 共享地图、历史分页、探索与操作记录 |
| `src/components/`、`src/state/` | 桌面界面、编辑与会话状态 |
| `src/adapters/` | 桌面与 GitHub 数据适配器 |
| `src-tauri/` | 桌面原生读取、Git 操作、导出与权限 |
| `extensions/vscode/`、`extensions/dsh/` | 插件宿主与共享 Git 服务 |
| `tests/`、`scripts/` | 回归验证、构建与打包 |
| `docs/` | 使用、操作边界、升级与发行说明 |

## 作者与许可证

作者：[fisHarly0](https://github.com/fisHarly0)。采用 [MIT License](LICENSE)，第三方依赖保留各自许可证。

欢迎通过 [Issues](https://github.com/fisHarly0/gitviz/issues) 提交问题和建议；安全问题请按 [安全反馈说明](SECURITY.md) 报告。

首次试用可按 [试用任务与反馈表](docs/usability-trial.md) 记录具体卡点；[可访问性检查进展](docs/accessibility.md) 列出已发现但尚未关闭的问题。

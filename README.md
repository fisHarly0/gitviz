# gitviz

浏览器端 game-save 风格 git 仓库可视化工具。把 commit 当存档点、把 if 分支当平行宇宙存档槽，而不是当传统树状日志。

100% 浏览器跑（React 19 + Vite + isomorphic-git + LightningFS），不需要后端。装好就能拖任何本地仓库进来看 + 改 + Export。

> 设计基调：vibe-coding 个人工具，对标 "黑魂存档读档" 的体验，不做新手友好 / 不做商业品 / 不做 i18n。如果你想要 GitKraken 那种全功能 git GUI，gitviz 不适合你。

## 核心 metaphor

```
                    main (emerald 绿) ─── 主时间线
                          │
       ┌──────────────────┴──────────────────┐
       │                                     │
   if-abc123-1 (amber 1)              if-abc123-2 (amber 2)
   平行宇宙存档槽 A                    平行宇宙存档槽 B
```

- **commit = 存档点**：点旧 commit → 进 preview 模式（黄色横幅 + 底部 status bar）
- **改动 = 起平行宇宙**：在 preview 状态下点任意文件 Edit → 自动起 `if-{shortSha}-{N}` 分支 → Monaco 改 → Save & Commit
- **主线毫发无伤**：所有改动都进 if 分支，main 永远干净
- **Export 出去**：切到 if 分支 → 下载 `.zip` 含 packfile + refs + README → 在真仓库 `git fetch /tmp/unzipped if-xxx:if-xxx-imported` 取出

## 三态状态机

```
 BROWSE  ── 点 commit ──>  PREVIEW  ── 点 Edit ──>  EDIT
   ▲                          │                     │
   │       leave-to-HEAD      │   onCommitInIf      │
   └──────────────────────────┴─────────────────────┘
```

详见 `src/state/useSession.js`。

## Quick start

需要 Node 18+ 和 Chrome 86+（用了 File System Access API）。

```powershell
git clone https://github.com/fisHarly0/gitviz.git
cd gitviz
npm install
npm run dev
```

dev server 默认在 `http://localhost:5173/`，被占用会自动漂移到 5174。

浏览器打开后点 **Pick repo (modern)** 按钮，授权一个本地 git 仓库目录。注意必须选 `.git/` 所在的目录（不是 `.git/` 本身）。

想快速试一下？克隆任何小仓库到本地 → 拖进来。或者用本仓库自带的 demo workflow：

```powershell
# 起个 demo repo
mkdir test-gitviz; cd test-gitviz
git init
echo "v1" > a.txt; git add .; git commit -m "v1"
echo "v2" > a.txt; git commit -am "v2"
echo "v3" > a.txt; git commit -am "v3"
# 然后到浏览器选 test-gitviz 目录
```

## 命令

```powershell
npm run dev     # dev server
npm run build   # prod build · 输出到 dist/ · ~676KB 主 chunk
npm run lint    # eslint · 当前 0 错
npm run preview # 预览 prod build
```

## Stack

| 层 | 库 |
|---|---|
| UI | React 19 + Vite 8 |
| commit graph | @gitgraph/react（imperative SVG） |
| git 引擎 | isomorphic-git 1.37 |
| 虚拟文件系统 | @isomorphic-git/lightning-fs（IndexedDB 持久） |
| 代码编辑器 | @monaco-editor/react（VS Code 同引擎，React.lazy 动态加载） |
| Export | jszip |
| 真磁盘读 | File System Access API（Chrome 86+） |
| 备用读 | `<input webkitdirectory>`（旧浏览器 fallback，skip 隐藏目录） |

## 已知 sharp edges

**Buffer polyfill 必装**。isomorphic-git 在浏览器需要 Node 的 `Buffer` global，否则 `readObject` 会假报 `NotFoundError`（错误信息完全不提 Buffer，调试地狱）。本仓库 `vite.config.js` 已配 `vite-plugin-node-polyfills` `{ globals: { Buffer: true, process: true } }`。详细踩坑过程见 [`gitviz-档案/调研/Buffer-polyfill-Vite-isomorphic-git.md`](gitviz-档案/调研/Buffer-polyfill-Vite-isomorphic-git.md)。

**100MB 单文件上限**。`loadDirHandleIntoFs` 会跳过 >100MB 的单文件避免 OOM / IndexedDB 卡死。被跳过的文件会出现在 console.warn + UI `skipped` 计数里。如果你的仓库有 LFS 大文件、视频、build artifact，要么先 clean 一下再加载，要么等桌面版（计划用 Tauri 接真磁盘，无此限制）。

**FSA API only on Chrome/Edge**。`showDirectoryPicker()` 在 Firefox/Safari 不支持，会 fallback 到 `<input webkitdirectory>`，但后者**会过滤 dot 目录**（`.git` 加载不到 → "No commits" 错误）。Firefox 用户暂时无法用。

**Firefox SVG `r` 属性不一定支持 transition**。Chrome/Edge hover 放大顺滑，Firefox 较老版本 hover 可能瞬切。本仓库 dot 点击的 `.pulsing` 用了 `transform: scale` fallback 形式，纯 hover 没做同步 fallback。

**StrictMode 已拆掉**。React 19 + StrictMode + @gitgraph/react imperative API 会双 mount 导致 SVG duplicate key，所以 `main.jsx` 不包 StrictMode。prod build 无副作用，dev 损失"额外副作用检测"。

**跨 session 持久未完全测**。LightningFS 数据存 IndexedDB 是持久的，但 FSA `dirHandle` 不持久，关浏览器再开要重新点 modern 按钮。后续 Phase P4 会做 auto-restore。

**Monaco cold load 2-3 秒**。从 CDN 拉 `monaco-editor` 核心，首次 Edit 体感慢。后续 Phase 会 vendor 本地化。

## 性能诊断（5.A.1 仪表）

加载大仓库觉得慢？打开 F12 console，找 `[gitviz]` 前缀的 log：

```
[gitviz] FSA API loaded 1234 files (456.7 MB) in 12.34s · 678 .git files · 200 .git/objects entries
[gitviz]   timing: count=234ms · walk+write=11890ms
[gitviz]   top 5 largest: ["assets/video.mp4 (45.2 MB)", "node_modules/electron/dist/... (38.1 MB)", ...]
[gitviz]   top 5 slowest writes: ["node_modules/.cache/foo (1234ms · 12.0 MB)", ...]
```

或者直接查全量 stats：

```js
window.__gitvizLoadStats
// → { totalFiles, totalBytes, gitFileCount, gitObjectCount, largeFiles[], slowFiles[], skipped[], timing }
```

## 路线图

完成：

- **P0** 三态状态机 + main/if 颜色 + UI
- **P1** Edit 按钮 + Monaco + 起 if 分支 + commit
- **P2** 多 if 线可视化 + IfLinesPanel
- **Export** zip bundle（packfile + refs + README 教 fetch 命令）
- **P3a** commit hover/click/pulse 反馈 + CommitDetail shimmer skeleton + 大文件诊断仪表

待办（顺序未定）：

- **Tauri 2.0 桌面版** —— 接真磁盘绕过 IndexedDB 限制，调系统 git CLI 加速
- **P3 黑魂存档槽位卡片视图** —— 可选替代 commit graph 的"槽位"风
- **P4 IndexedDB 跨 session restore** —— 自动加载上次 repo
- **P5 merge / cherry-pick 游戏化 UI** —— "把 if 线收回主线"按钮
- **P6 真 push 到 GitHub** —— PAT 直推，跳过 .zip 中间步骤
- **5.A.1 实际 perf fix** —— depth slider / virtual scroll / 大文件 readonly preview（等用户拿真大 repo 撞墙后针对性改）

## 仓库结构

```
src/
  App.jsx                  顶层组件，集成 useSession
  main.jsx                 入口（已拆 StrictMode）
  state/useSession.js      三态状态机 + actions
  adapters/
    localAdapter.js        FSA + LightningFS + isomorphic-git 主适配
    RepoAdapter.js         适配接口 JSDoc
  components/
    RepoLoader.jsx         双入口（modern FSA / legacy webkitdirectory）
    CommitGraph.jsx        @gitgraph/react · 主线/if 线 5 色
    CommitDetail.jsx       右侧详情 + Edit 按钮 + skeleton
    EditorPanel.jsx        Monaco wrapper · 25 种语言映射
    IfLinesPanel.jsx       顶部分支 chip 横条
    ExportButton.jsx       jszip 打包
    PreviewBanner.jsx      preview 横幅
    ModeStatusBar.jsx      底状态栏
gitviz-档案/                项目档案（状态/日志/vibe库/调研）
```

## License

私人项目，没 license。如果你点进来想用，自己 fork 着玩。

---

源码：https://github.com/fisHarly0/gitviz · 作者：[fisHarly0](https://github.com/fisHarly0)

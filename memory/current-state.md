# 当前状态 / Current State

更新时间：2026-09-11

- 项目定位：Tauri 2 + Rust(gix) 的 Git 仓库可视化与实验性分支编辑工具。
- 当前状态：桌面 MVP、读写路径、if 分支导出、diff 和 GitHub 只读浏览已完成；MSI/NSIS 安装包尚未完成。
- 架构边界：前端通过 adapter 调用 Tauri command；本地模式可写，GitHub 模式只读；capabilities 保持最小权限。
- 真源：`README.md`、`gitviz-档案/`、`src/` 与 `src-tauri/`。

## 接手约束

涉及真实仓库写入、分支创建、导出 loose objects、GitHub PAT 或 Tauri 权限时，先核对安全边界和回滚点。不得把用户仓库路径、PAT 或导出内容写入档案。

## 本轮状态

只新增治理档案，没有修改 README、TUTORIAL、Rust 或前端业务代码。

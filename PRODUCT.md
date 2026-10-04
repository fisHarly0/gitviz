# Gitviz

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

作者本人及希望直观看懂 Git 分叉、合并与历史版本的开发者。

## Product Purpose

用游戏存档的直觉浏览真实代码历史。用户已确认树状图、可交互节点、节点选择与变换、版本回滚；目标宿主为 VS Code 与 DeepSeek Harness。

## Operating Context

现有项目为 React + Tauri/gix。2026-10-04 用户同意先开发 VS Code 插件，共用可视化核心，随后适配 DSH。已有工作区 F:/gitviz；新增临时产物 F:/Codex/work，缓存 F:/dev/cache。

## Capabilities and Constraints

节点必须对应真实提交，合并必须保留所有父边。选择只预览；恢复须明确说明影响，保留历史与恢复前引用。有未提交修改时阻止切换和恢复。试验使用独立 worktree。

## Brand Commitments

Gitviz；存档点、主线、试验线的游戏化术语和直观树图。继承已有深色、绿色主线与琥珀色试验线，插件同时尊重宿主主题。

## Evidence on Hand

现有源代码、docs/images/gitviz-github.png；测试仓库是合成数据，不能冒充用户项目。

## Product Principles

- 先画准历史，再增加动作与反馈。
- 预览与实际文件位置明确区分。
- 每个写入动作都有明确结果、失败说明和回到旧状态的路径。
- 可视化组件不依赖单一宿主。

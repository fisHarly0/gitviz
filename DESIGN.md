---
name: Gitviz
description: 游戏存档式 Git 版本地图与宿主主题下的动作检查器
colors:
  tree-bg: "var(--vscode-editor-background, #0d1117)"
  tree-panel: "var(--vscode-sideBar-background, #151b23)"
  tree-raised: "var(--vscode-input-background, #202935)"
  tree-border: "var(--vscode-panel-border, #303c4b)"
  tree-ink: "var(--vscode-editor-foreground, #e6edf3)"
  tree-dim: "var(--vscode-descriptionForeground, #a6b4c4)"
  tree-green: "#5dd9a5"
  tree-amber: "#f0be69"
  tree-blue: "#82b6f9"
  tree-purple: "#b5a3ed"
  tree-pink: "#eea0c2"
  tree-green-light: "#15794d"
  tree-amber-light: "#8b5908"
  tree-blue-light: "#285caf"
  tree-purple-light: "#7950b1"
  tree-pink-light: "#a33769"
  tree-focus: "var(--vscode-focusBorder, #82b6f9)"
  tree-error: "var(--vscode-errorForeground, #ff9d9d)"
typography:
  title:
    fontFamily: "var(--vscode-font-family, 'Segoe UI', 'Microsoft YaHei', sans-serif)"
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-.025em"
    lineHeight: 1.5
  headline:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.5
  section:
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: "var(--vscode-font-family, 'Segoe UI', 'Microsoft YaHei', sans-serif)"
    fontSize: "var(--vscode-font-size, 13px)"
    lineHeight: 1.5
  node-message:
    fontSize: "12px"
    fontWeight: 550
  label:
    fontSize: "10px"
  code:
    fontFamily: "var(--vscode-editor-font-family, Consolas, monospace)"
    fontSize: "11px"
rounded:
  compare-label: "3px"
  file-row: "4px"
  select: "5px"
  button: "6px"
  save-node: "8px"
  marker: "50%"
spacing:
  node-gap: "4px"
  button-gap: "7px"
  field-gap: "8px"
  action-gap: "10px"
  header-gap: "12px"
  inspector-inset: "20px"
  header-inset: "22px"
components:
  button-default:
    backgroundColor: "{colors.tree-raised}"
    textColor: "{colors.tree-ink}"
    rounded: "{rounded.button}"
    padding: "7px 11px"
  button-primary:
    backgroundColor: "{colors.tree-green}"
    textColor: "{colors.tree-bg}"
    rounded: "{rounded.button}"
    padding: "7px 11px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.tree-ink}"
    rounded: "{rounded.button}"
    padding: "7px 11px"
  button-active:
    backgroundColor: "{colors.tree-raised}"
    textColor: "{colors.tree-amber}"
    rounded: "{rounded.button}"
    padding: "7px 11px"
  search-input:
    backgroundColor: "transparent"
    textColor: "{colors.tree-ink}"
    padding: "5px 3px"
  branch-select:
    backgroundColor: "{colors.tree-panel}"
    textColor: "{colors.tree-dim}"
    rounded: "{rounded.select}"
    padding: "5px 8px"
  save-node:
    backgroundColor: "{colors.tree-panel}"
    textColor: "{colors.tree-ink}"
    rounded: "{rounded.save-node}"
    padding: "9px 12px"
    width: "188px"
    height: "76px"
  compare-label:
    backgroundColor: "{colors.tree-amber}"
    textColor: "{colors.tree-bg}"
    rounded: "{rounded.compare-label}"
    padding: "0 4px"
  file-row:
    backgroundColor: "transparent"
    textColor: "{colors.tree-ink}"
    rounded: "{rounded.file-row}"
    padding: "9px 11px"
---

# Design System: Gitviz

## DSH surface extension · 2026-10-04

DSH Web 的 `extensions/dsh/panel.css` 将中性色映射到宿主 `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1`、`--dsw-alias-interactive-bg-hover`、`--dsw-alias-border-l3` 和 label-primary/secondary。强调色继承地图既有深浅色值，暗色由 `body[data-ds-dark-theme]` 驱动。CSS 构建时统一限制在 `.gitviz-dsh` 内，移除地图原始 html/body 重置；不影响 DSH 壳层。

面板占宿主可用高度，容器小于 680px 时检查器移到地图下方。确认与命名使用原生 dialog，Escape 取消并恢复焦点；文件差异使用同一弹窗容器、等宽行号、增删颜色与符号。插件停用时释放样式和插槽。实际截图为 `docs/images/gitviz-dsh.png`；深浅主题和 600px/900px 合成视口已检查。原有 VS Code token 表保持为共用地图的默认定义。

## Overview

**Creative North Star: "游戏存档式版本地图"**

Gitviz 将真实提交呈现为可浏览的存档点，用主干、分叉与合并连接解释历史。视觉继承现有深色、绿色主线与琥珀色试验线语言；版本地图进入 VS Code 后，背景、文字、控件表面与焦点颜色跟随宿主，深色与浅色使用各自的语义强调色。

本文件记录已实现的 `src/version-tree/`，依据 `version-tree.css`、`TreeMap.jsx`、`VersionTree.jsx` 与 `layout.js`，并核对 `.impeccable/review/desktop.png` 和 `light.png`。既有 Tauri 界面及 `src/App.css` 未迁移到这些 token；不要将本文件解释为已完成全应用主题统一。前置 token 是现有值的文档化映射，不是新增运行时主题配置。

**Key Characteristics:**

- 紧凑的工具界面，地图与详情检查器并置。
- 绿色标明实际 HEAD，琥珀色描边标明正在预览。
- 使用真实父边、文字状态与宿主原生差异查看。
- 深浅色沿用相同布局，强调色随模式调整。

## Colors

中性色来自宿主，绿色与琥珀色承担主要识别，其余分支颜色帮助分辨并行历史。

### Primary

- **主干绿**（`tree-green`）：品牌图标、第一 lane、HEAD 边框与实心标记、工作区干净状态、新增文件和主操作。
- **试验琥珀**（`tree-amber`）：第二 lane、预览外框、比较状态、选中提交编号、未提交修改提示和常规文件变化标记。

### Secondary

- **分支蓝、分支紫、分支粉**：第三至第五 lane，超过五条 lane 时循环；粉色还用于删除文件。
- **宿主焦点色、宿主错误色**：分别用于键盘焦点与错误通知，不以分支颜色代替宿主反馈。

### Neutral

- `tree-bg` 是地图及整体底色；`tree-panel` 是检查器、存档卡片与状态条表面；`tree-raised` 是普通按钮和选中卡片表面。
- `tree-border` 分隔工具区、检查器与各信息块；`tree-ink` 是正文，`tree-dim` 是次要信息。
- `body.vscode-light` 将五个强调色切换为对应的 `-light` 值；这些文档键对应现有选择器覆盖，并非新的 CSS 变量。宿主不提供变量时才使用前置 token 中的回退值。

**The Position and Preview Rule.** 实际位置使用绿色实心标记与“你在这里”；预览使用琥珀色外框，并在状态栏说明文件未切换。颜色始终配合文字。

当前 lane 色由布局位置决定，优先突出 HEAD 的第一父链；它不保证名为 `main` 的分支永远绿色，也不保证所有试验分支永远琥珀色。历史窗口外单独保留 HEAD 时，不将其强制作为布局主干。

## Typography

字体继承 VS Code 界面字体与字号，回退为系统中文可用字体。提交编号使用宿主编辑器等宽字体，并启用等宽数字。没有单独的装饰字体或营销式大标题。

- `title` 用于 Gitviz 标题；`headline` 用于检查器的提交说明。
- `section` 用于地图与检查器区块标题。
- `body` 是宿主可配置的正文基线；工具提示性正文、文件名和节点说明多用 12px，辅助信息多用 11px，紧凑标签多用 `label`。
- `node-message` 单行省略；节点作者或引用也单行省略。检查器正文和路径允许任意位置换行，完整多行提交说明以保留换行的滚动区展示。

## Layout

根界面高为 `100dvh`，最小高度 400px；顶部依次为品牌与仓库选择、当前位置条、工具区和可选比较条。中部占据余下高度，底部显示仓库与历史载入状态。

宽屏地图与检查器使用 `minmax(0, 1fr) 310px` 网格；950px 以下检查器收至 270px，同时缩短部分说明和横向边距。640px 以下改为纵向滚动，地图占 58vh 且至少 420px，检查器移至下方，搜索独占一行。

地图底纹间距为 24px。节点由 48px 起始留白、236px 横向 lane 间距和 116px 纵向层级间距定位；缺失父边后多留一层，避免虚线碰到无关节点。卡片尺寸使用前置 token 的 `save-node`。较新提交在上，祖先在下；合并保留每条真实父边。

地图可滚动、空白拖动和平移定位；缩放范围为 35%–160%，适应窗口不放大超过 100%。节点选择支持上下方向键、Home 和 End。搜索及路径聚焦降低无关节点透明度，不删除其历史关系。

## Elevation & Depth

版本树没有阴影。层级由宿主表面色、细边框、区域分隔和状态外框表达。地图曲线默认半透明，当前祖先路径提高不透明度与线宽；未加载父边用虚线并配文字说明。选择动画将外框距离从 7px 收至 3px，不改变节点内容或层级关系。

## Shapes

矩形信息区以分隔线组织；控件与存档卡片采用前置 token 中的小圆角。圆形空心标记表达 lane，实心绿色标记表达 HEAD。比较 A/B 使用紧凑小矩形标签。地图背景是低对比圆点网格，连接线是无填充的曲线。

## Components

### Buttons

普通按钮使用浮起表面与细边框；主按钮使用主干绿，承载“从这里试一版”等操作；安静按钮默认透明；比较模式按钮使用琥珀色文字与边框。主按钮字体为 650，按钮行高为 1.4。悬停通过现有 `color-mix()` 配方调整表面，禁用透明度为 0.48。键盘焦点使用 2px 宿主焦点色外框，偏移 3px。

### Inputs / Fields

搜索输入没有独立填充或边框，使用绿色光标、次要色占位文本，并保留可见焦点。分支路径选择器使用面板底色与细边框，宽度上限在中等布局收窄。该选择器聚焦一条历史路径，不切换工作文件。

### Savepoint Cards

顶部为 lane 标记、短提交编号与可选 HEAD、A/B、合并标记；中间为提交说明；底部为引用、作者或边界说明。悬停显示 lane 边框；选中显示琥珀色外框和浮起表面；HEAD 边框为绿色。HEAD 与选中可以同时存在。搜索或聚焦之外的卡片透明度为 0.28，悬停及键盘聚焦恢复可见度。

### Action Inspector

检查器用面板底色和分隔线串联只读说明、提交详情、节点动作与文件变化。普通点选仅更新预览；比较模式显示 A → B 并隐藏节点动作。文件变化行以字母及中文说明标记类型，点击后调用宿主差异查看。恢复和切换在 dirty 状态下禁用，旁边给出文字原因；处理中的通知提醒查看宿主输入或确认提示。

### Navigation and Feedback

仓库选择、刷新、路径选择、定位 HEAD 与缩放组成工具式导航，没有侧栏标签页。当前位置条持续区分 HEAD、未提交修改及预览。错误使用 `alert`，进度与结果使用 `status`。空仓库与首次加载使用居中图标、标题、说明和一个相关操作。

节点移动、描边、背景和路径不透明度使用短暂的状态过渡；具体时长见 sidecar。`prefers-reduced-motion: reduce` 禁用动画、过渡和平滑滚动。

## Do's and Don'ts

### Do:

- Do 延用宿主中性色与深浅色强调色映射。
- Do 保留实际 HEAD、预览及比较之间的文字和视觉区分。
- Do 保留所有真实父边，并清楚标注未载入的历史。
- Do 在小窗口中将检查器放到地图下方，保留完整动作与说明。
- Do 保留键盘焦点和减少动态效果支持。

### Don't:

- Don't 将 lane 颜色解释为永久绑定的分支名称。
- Don't 用点选预览暗示工作文件已经切换。
- Don't 将版本树主题 token 当作旧 Tauri 界面已完成迁移的证据。
- Don't 为记录现状而添加未实现的色阶、阴影或装饰组件。

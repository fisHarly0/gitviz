# 共享地图主题、语义与焦点

工作区 F:/gitviz，main，基线 62c8c98，开始时干净。用户重新启用公开产品目标并移除此前检查时间；目标保持完整。基线 CI 37507412879 三系统成功。

## 修正

- 地图画布具名 group、搜索结果具名 region，消除无有效角色的 aria-label。
- 非匹配节点以 tree-bg/tree-dim 区分，不再用 opacity .28 降低文字可读性；高对比度浅色继承既有浅色强调色。
- 显式定位的 RAF 聚焦成功后清除 pendingFocus；同一请求只消费一次，后续缩放不再夺取按钮焦点。
- 设计 brief、DESIGN.md 与 sidecar 同步本批规则，不重整其他既有设计缺口。

## 验证

31 项前端单元测试及 lint 通过。两种插件构建、DSH 打包安装通过。VS Code 实际开发扩展四主题共 12 状态零 violation/incomplete，定位/引用返回/缩放焦点、窄面板及 Git 不变量通过。`tests/map-accessibility-smoke.cjs` 已实际运行，证据 `F:/Codex/work/gitviz-product/map-a11y-20261007/regression/`；相同流程 `verified/` 的 12 张截图用于独立复核。

DSH 实装当前包，深浅主题搜索、地图语义、键盘定位与 Git 未变化通过；实际服务客户端与安装源码核对一致，结果 `map-a11y-20261007/dsh/result.json`。只操作隔离 home、profile 与合成仓库。

最终 Windows 原生桌面：`F:/Codex/work/gitviz-product/map-a11y-desktop-final-20261007/`，2000 条历史、7 个状态均零 violation，仅余 color-contrast incomplete；新增 mapZoomFocus=true 断言通过，宽窄地图、分支键盘、真实 hook 失败后恢复与退出码 0 全部通过。历史只有角色/颜色修正的早期结果不代替这份最终焦点修正后的证据。

独立完成复核 disposition 为 ship，范围限定本批共享地图改动与 VS Code 四主题证据；没有替其他系统、屏幕阅读器或最终发行包验收背书。文档对比仅修复新增差异，JSON 与 diff 检查通过。

本机曾遇到系统内存提交额度不足、Vite -1073741819 和一次 Rust E0463。重建最终桌面时仅在命令环境使用 CARGO_BUILD_JOBS=1、RAYON_NUM_THREADS=1、RUST_MIN_STACK=16777216；项目构建配置未改，也未声称已定位工具异常根因。最终构建日志 map-a11y-focus-build-final.log 显示成功。

## 后续

完整公开产品目标仍未完成：桌面渐变/遮挡颜色人工判断、完整屏幕阅读器/缩放/全部键盘场景、朋友试用、其他系统原生 UI、间歇启动根因、最终候选包安装升级及正式发行仍需证据。下一步先看本批 CI，再针对剩余验收推进；避免对即将被替换的候选重复全套升级。

# 接续：地图折叠与探索

项目 F:/gitviz，main，批次基线 7ed3601。用户持续授权完善公开产品、提交和推送；本批仅推进 P2 地图可读性，完整目标仍保持进行中。

## 实现

- 新增 `src/version-tree/projection.js`：折叠至少三个普通线性提交，保留真实父连接、HEAD、引用、根、分叉、合并和边界；选择/比较/搜索显露真实节点。摘要 ID 不进入 Git 接口。
- 共享 TreeMap 增加展开/重新折叠/全部节点、可检索引用导航、父子 1/2/4/8 步附近探索。原键盘、缩放、视口裁剪及桌面横竖方向保持可用。
- 引用导航占用原画布区域，返回/Esc 恢复入口焦点，选择引用返回地图；未加载目标走原分页定位。附近范围只含已加载提交，范围外父边明确标识。
- 修正折叠节点样式层叠及搜索/路径淡化。窄面板不再因引用列表压缩地图。
- 新增 5 项图投影测试、扩充真实大历史测试、三端原生只读冒烟脚本；README 和 `docs/map-exploration.md` 说明入口与边界。Git 写入后端未改。

## 本轮证据

- `npm test` 25/25；`npm run lint`；桌面前端、VSIX、DSH tarball 和 Windows release exe 构建通过。
- `npm run history:test` 4/4；2000/5000/10000 真实提交逐页完整读取，搜索/父关系和折叠后边集合核对通过。日志 `F:/Codex/work/gitviz-product/map-history-test.log`。
- `tests/map-exploration-smoke.cjs` 在 Windows 原生桌面、安装的 VS Code 插件、DSH 插件中分别通过一万条提交检查。覆盖折叠展开、真实节点键盘、未加载标签定位、隐藏节点搜索、附近范围及再居中、缩放、引用空态/返回/Esc/焦点、折叠虚线及悬停、搜索淡化；插件另验证比较/分支淡化，桌面另验证横竖方向。
- 操作前后 HEAD/status/show-ref 一致，无页面错误。各端视口仅挂载 4–8 个节点；这不是历史总数限制。
- 最终结果和截图：`F:/Codex/work/gitviz-product/map-ui-tests/map-{desktop,vscode,dsh}-result.json`，同名前缀 `wide.png`、`narrow.png`（引用页）、`narrow-map.png`。三端窄画布高度分别 204/232/262px，引用页开关不改变画布高度。截图副本 `.impeccable/review/` 不提交。
- 最终日志 `map-{desktop,vscode,dsh}-final-ui.log`；VS Code 使用隔离 profile/extensions，DSH 使用隔离 home，未安装到日常配置。DSH 安装的 client.js 与本地构建 SHA-256 一致。自己的测试应用已关闭，9235/9248/3087 监听已检查。

## 本地产物

目录 `F:/Codex/work/gitviz-product/map-final-packages/`，仅为开发构建，尚未正式发行或上传商店。版本号沿用 0.2.0，不等于原有旧包。

| 文件 | SHA-256 |
|---|---|
| gitviz.exe | 7AC24B9F54C5B1BAB7C867D7CDDE01727C44FCA55D9A72F0D2360D7B8B109833 |
| gitviz-0.2.0.vsix | EA5AC99E9CA970DC883B6B2C2B9962ADF176D7EC3F512822399F4EA587FFD357 |
| fisharly-gitviz-dsh-0.2.0.tgz | 8DA612488DB19241C79695C8C4E997EB316827837429120710164B1914693B55 |

## 设计收尾

沿用现有主题，方向契约 `.impeccable/surfaces/version-map.md`。一次 detector 的四个 advisory 属于既有颜色/字号档案差异，未扩大范围修复。独立初评要求修复引用挤压、折叠样式覆盖与淡化遗漏，已单批修改并完成三端复测；最终裁定为 ship，三项均 resolved。该裁定覆盖三项修正，不冒充重新执行的全界面审计。独立文档核对确认没有新增全局 token，DESIGN.md 与 design.json 原样保留；既有档案格式、DSH 断点及组件记录差异仅报告。报告 `F:/Codex/work/gitviz-product/map-design-documentation.md`。无新增发布用位图素材。

## 仍未完成

完整公开产品交付不能据此完成。P1 多宿主完整原生并发与其他平台验证，P2 首次使用/安装升级引导，P3 CI、正式版本/安装包/发行验证仍需继续。超过一万条、更复杂生产仓库和其他操作系统不能宣称本轮实测。下一批按公开产品清单推进一个模块，不重复本批地图精修。

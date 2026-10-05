# Version map extension

Mode: Operate. Targets: `src/version-tree/TreeMap.jsx`, `projection.js`, `version-tree.css`; shared by desktop, VS Code and DSH.

## Direction contract

THESIS: 看懂长历史中的关键位置，再进入细节。保留分叉/合并、HEAD、引用和当前选择；普通连续过程折叠为明确标注的段，不用海量同等权重卡片填满画布。

OWN-WORLD: 延用 DESIGN.md 的宿主中性色、绿色实际位置、琥珀预览、小圆角节点与真实连线；折叠段采用虚线边框和明确数量，视觉上区别于可操作的真实提交。

STORY: 首先看主线和分叉；点击一段展开、搜索或引用定位目标；需要理解附近关系时限制父子跳数。所有导航只读，写入仍由详情区独立确认。

FIRST VIEWPORT: 既有标题与当前位置按钮下增加紧凑、可换行的导航控件；地图仍占主要区域。引用列表按需切入原画布区域，提供检索、单一滚动列表及明确的返回入口；关闭后保留地图空间与位置。深浅主题和窄面板沿用相同层次。

FORM: 既有表面的局部扩展，直接塑造已授权功能；没有新视觉世界或方向抽签。标志交互是折叠段展开时保持定位，键盘继续逐个选择真实提交。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

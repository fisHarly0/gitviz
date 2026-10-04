# 大历史版本地图

2026-10-04，用户授权桌面本地、VS Code、DSH 三端完整浏览 2000+ 提交。

## 验收

- [x] 本地所有 heads/remotes/tags 与 HEAD 可达历史可逐批读到末尾，没有总条数硬截断；浅克隆明确提示本机历史不完整。
- [x] 全历史搜索提交说明、作者、OID、引用名；结果可定位到地图中的历史节点，定位过程可取消。
- [x] 共享地图只挂载可见节点和相交连线；选择、键盘、缩放、平移、深浅主题保持可用。
- [x] 桌面本地采用共享地图，保留原有详情/编辑工作流和横竖视图；普通点选不改变仓库目录、HEAD 或工作文件。
- [x] 分页携带 refs/HEAD revision；历史改变则拒绝旧分页，避免跳项。换仓库和过期异步结果不能污染新地图。
- [x] 合成 2000/5000/10000 提交 + 分叉/合并的真实仓库：数量、OID 去重、全部父边、最早提交搜索定位与渲染数量验证。
- [x] Node、Rust、三端 UI、lint/build 与本地包验证；保留证据及局限。

完成证据及边界见 `memory/handoff-2026-10-04-large-history.md`。更大于 10000 的规模未实测；桌面原生文件选择框未自动化验证。

## 契约

snapshot 返回初始批次、revision、nextCursor、total、shallow，以及已有元数据。historyPage({cursor,limit}) 返回 commits/nextCursor/revision；cursor={revision,offset}，每批 20..2000，总数无硬限制。旧 HEAD 可作为额外边界节点保留；下一页不能因此漏掉一个提交。

searchHistory({query,cursor?,revision,limit?}) 在全可达历史搜索，返回 commits、nextCursor；结果分页独立于历史分页。选结果后客户端逐页读取到目标并定位，读取可停止，已读数据保留。

Node GitService 支持 VS Code/DSH；桌面增加只读 Rust Git CLI commands，参数数组无 shell，沿用当前已打开仓库授权。桌面新地图需要本机 Git，缺失时给出可操作错误。旧 gix 写入命令、导出和权限保持不变。GitHub 在线模式继续使用既有只读图，本批不增加远程 API 请求。

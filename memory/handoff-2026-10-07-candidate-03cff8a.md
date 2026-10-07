# 固定产物验证收尾 · 2026-10-07

项目 `F:/gitviz`，main，基线 `03cff8a`，开始时工作区干净。用户在上轮超时停止后要求完成剩余 DSH 验证与文档更新。本批只改验证文档，不改生产代码或放宽测试条件。

- CI 37586172143 三系统成功；已下载并核对源提交、全部文件大小/SHA、跨平台插件一致性和 Unix 执行权限。
- Windows CI 首次安装、重装、卸载通过。桌面原 0.2.0 免安装 → 固定 NSIS：2000 条历史、隔离存储、真实 hook 失败、正常重启继续及卸载保留数据均通过。
- VS Code 1.140.0 三阶段通过，首次驱动中断后的升级与重启使用同一 profile/fixture 续跑；如实记录中断而不冒充单次完整执行。
- DSH 0.2.0-rc.2 Web 三阶段通过，实际安装包与服务器提供的客户端匹配。首次失败发生在测试仓库准备阶段，只有初始化目录且尚无 fixture.json；复验增加逐命令耗时日志，未更改 30 秒超时，未复现。不能宣称已定位或修复该间歇超时。

证据根目录：`F:/Codex/work/gitviz-product/release-03cff8a/`。DSH 的 `dsh-retry.log` 三条 PASS、`dsh-upgrade/outcome.txt` success 和三个阶段 JSON 为成功证据；`initial-failure/` 保留先前失败。桌面 `desktop-migration-result.json`、VS Code `resume-outcome.txt` 已核对。截图也已检查。仅使用合成仓库和隔离宿主，无模型调用或用户仓库写入。

仓库交付：README、docs/delivery.md、docs/upgrade-testing.md、新的固定产物 JSON、本交接、current-state 与公开产品 spec。报告由实际结果文件生成，校验各阶段 passed、包哈希和迁移结果。文档变更只需 JSON/链接及 diff 检查，不重复生产构建。

仍缺：全面可访问性及朋友试用（用户计划后续安排）、Linux/macOS 原生 UI、默认 AppData 实际迁移、历史间歇启动/测试准备超时根因、正式签名/外部发行。离线编辑和六组关闭的固定包证据仍是 486dae3。上轮 STOP-HANDOFF 是历史停止点，本次成功记录优先；不要因本批收尾将完整公开产品目标标记完成。

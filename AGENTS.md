# AGENTS.md · gitviz 协作入口

本文件是统一入口兼容层。项目原有 `README.md`、`gitviz-档案/` 和 `src-tauri/` 契约是真源；本文件不复制 Git 操作字段。

## 接手顺序

1. 读取 `AGENTS.md`、`.ai-standard.yml` 和 `memory/current-state.md`。
2. 读取 `README.md`、`gitviz-档案/状态档案.md` 与当前模块 spec。
3. 同时核对前端 adapter、Tauri command 和 capabilities，确认读写边界。

稳定流程入口：`D:/AAA PROJECT/real-vibecoding-harries/操作手册/首次打开统一流程.md`。一次只做一个模块；涉及真实 Git 写入、导出或远程访问时先建立决策记录。

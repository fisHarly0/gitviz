# AGENTS.md · gitviz 协作入口

本文件是统一入口兼容层。项目原有 `README.md`、`gitviz-档案/` 和 `src-tauri/` 契约是真源；本文件不复制 Git 操作字段。

## 接手顺序

1. 读取 `AGENTS.md`、`.ai-standard.yml` 和 `memory/current-state.md`。
2. 读取 `README.md`、`gitviz-档案/状态档案.md` 与当前模块 spec。
3. 同时核对前端 adapter、Tauri command 和 capabilities，确认读写边界。

稳定流程入口：`D:/AAA PROJECT/real-vibecoding-harries/操作手册/首次打开统一流程.md`。一次只做一个模块；涉及真实 Git 写入、导出或远程访问时先建立决策记录。

## 署名规则

本工作区自动化提交使用用户身份 `fisHarly0 <1211074765@qq.com>`。不得将 AI 工具或模型列为作者、共同作者、贡献者，不添加 AI 的 `Co-authored-by`、生成署名或致谢；同样适用于 README、界面、包元数据、提交说明、PR 和 Release。保留实际人类贡献者及第三方许可证中的合法署名。除非用户明确要求，不重写既有提交历史。

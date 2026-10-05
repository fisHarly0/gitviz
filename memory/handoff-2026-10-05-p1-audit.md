# P1 最终验收核对

`F:/gitviz` / main，基线 `601c477`，开始时干净。当前完整目标仍为公开产品交付。本批核对并关闭 P1 Git 一致性、编辑与恢复两项，不关闭 P2/P3。

## 本批工作

- 审查现行 Rust 操作/记录/IPC/capabilities、Node GitService、Tauri adapter、会话与编辑保护，以及对应测试断言。确认生产写入后端相对已完成原生失败批次 `7ed3601` 无行为变化，Rust 此后只有签名测试增加；后续试验流程有独立三端实测。
- 读取 17 份历史真实 UI/签名结果及原生并发完整三轮断言，逐项对应要求。`docs/p1-acceptance.md` 给出两组要求表和限制；`docs/p1-evidence.json` 保存真实文件 SHA256 与检查结果摘录。重新计算 17 个 SHA 全部一致。摘要不代替原测试，明确这些是复核而不是本批重跑。
- 新增 Rust `linked_edit_paths_are_rejected_without_touching_the_external_target`：真实 Windows junction；直接路径检查及真实编辑预览拒绝，HEAD/index/外部目标字节/记录均不变。Unix 使用真实目录 symlink，并额外检查文件 symlink，未在 Windows 冒充执行该 cfg 分支。
- 不改生产后端/UI，不引入新权限或依赖；未在用户仓库测试写入。

## 本批验证

`cargo test --release --locked --lib linked_edit_paths -- --nocapture --test-threads=1`：1/1（27 项未运行）；`cargo check --release --locked --all-targets` 通过。最终日志在 `F:/Codex/work/gitviz-product/p1-audit-links-final.log` / `p1-audit-check.log`，合成仓库 `p1-audit-tests/`；Cargo 缓存仍 F 盘。`git diff --check` 通过，无前端修改，不重建前端或最终包。没有运行中的本批应用或测试进程。

a576797 / CI37334503429 三系统通过。已等待并核对 601c477 的新签名 CI37335956148，三系统全部成功（跨入 2026-10-06 后确认），含 Windows NSIS 安装冒烟；没有因本批推送取消它。新链接用例仍需本批 CI 验证 Unix 分支。

## 剩余目标

接续从 P2 首次使用的语言/可访问性检查及 P3 最终包验收推进。GitHub 在线复验已在上批补齐。真实陌生用户试用、Linux/macOS 原生 UI 和最终选定提交的干净安装/升级/三端冒烟仍缺证据。历史每批局部构建不可直接当作最终发行包。

P1 的关闭保留证据表中的范围：外部 Git 不受排他锁约束，最后检查后的竞态、hooks 外部副作用、强杀/断电不承诺自动恢复；SSH 签名通过不覆盖所有签名设备。此前 Windows 偶发进程清理异常未确认根因，保守写锁/错误恢复路径仍适用，不宣称根因修复。

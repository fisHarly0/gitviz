# 提交签名验收补证

`F:/gitviz` / main，基线 `a576797`，开始时干净。此次从 P1 最终核对发现真实签名缺证据：现有全部 fixture 关闭了签名。没有修改生产 Git 操作或 UI，只增加测试和验证说明。

## 实现与证据

- `tests/helpers/signing-fixture.cjs` 在每个合成仓库 `.git/signing fixture/` 生成独立 SSH Ed25519 密钥和 allowed signers，设置仓库级 `gpg.format=ssh`、`gpg.ssh.program`、`user.signingkey`、`commit.gpgsign=true`。路径带空格，成功测试最后删除临时私钥。不会读取用户密钥、调用个人 agent 或改变全局配置。
- `tests/git-service.test.cjs` 新增 2 项：恢复产生真实可验证签名并核对身份、parent、tree、backup、clean；缺失密钥失败后保留 HEAD/文件/index/检查点，重新打开 GitService、重新预览确认并续交，仍得到有效签名和同一记录/备份。
- `src-tauri/src/commands/operations.rs` 测试模块新增 2 项：桌面保存编辑的签名与身份；签名失败保留编辑，再用新 Operations 实例从检查点续交。没有生产 Rust 行为变化。
- 两端均实际运行 `git verify-commit`，不是只检查 `gpgsig` 字段或模拟签名程序成功。

Windows 定向检查：

| 命令 | 结果 | 证据 |
|---|---|---|
| `node --test --test-name-pattern='SSH signing' tests/git-service.test.cjs` | 2/2，约 19 秒 | 当前工具输出及 `F:/Codex/work/gitviz-product/signing-node-result.json` 摘要 |
| `cargo test --release --locked --lib ssh_signing -- --nocapture --test-threads=1` | 2/2，25 项未运行，约 25 秒测试 | `F:/Codex/work/gitviz-product/signing-rust.log` |
| `cargo check --release --locked --all-targets` | 通过 | `F:/Codex/work/gitviz-product/signing-rust-check.log` |
| `npm run lint`、`git diff --check` | 通过 | 当前工具输出 |

fixture 根 `F:/Codex/work/gitviz-product/signing-tests/{node,rust}`，Cargo 缓存 `F:/dev/cache/cargo`。未重复无关 UI/大历史测试或重建发行包。既有 CI 的完整 Node/Rust 测试会自动包含新增用例；三系统新签名证据仍需看本批 CI。贡献指南明确测试环境需 OpenSSH ssh-keygen，缺失不得跳过。GPG、硬件密钥、交互式解锁仍不在本次覆盖范围；操作恢复文档说明签名失败后修正配置再继续，不自动降为未签名提交。

## 上批待办收尾

GitHub 未登录额度恢复后重新启动自己隔离的 Integrated Browser，`tests/github-readonly-smoke.cjs live` 加强断言全部通过。`github-readonly/live-recovered.log` / `live-result.json` 的真实提交为 `a5767975650af51ed9e7e64b4aada286613e2dc8`；真实详情、键盘返回与 1280/392px 无溢出检查通过。测试脚本补了 CDP 和工作台页面的启动等待，未改 UI。本批没有再次执行已通过的受控故障测试。

上批 a576797 的 CI [37334503429](https://github.com/fisHarly0/gitviz/actions/runs/37334503429) 三系统均成功，包括 Windows NSIS 与安装冒烟；不包含本批新签名用例。自己的测试 Code 49480、preview 36520 已在核对 PID/命令行后停止，不作为正常退出验收。

## 未完成

签名子项和上一批在线复验补齐，不代表 P1/P2/P3 整体验收关闭。下一步逐项核对 P1 其余累积证据、可访问性及最终发行包。真实陌生用户试用与 Linux/macOS 原生 UI 仍缺证据；不能把后端 CI 通过当作它们完成。

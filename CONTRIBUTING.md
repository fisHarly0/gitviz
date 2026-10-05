# 贡献 Gitviz

问题与改进建议请提交到 [Issues](https://github.com/fisHarly0/gitviz/issues)。描述宿主、系统、Git/程序版本、预期行为和复现步骤；用合成仓库复现，不附私人源码、凭据或访问令牌。

## 本地开发

使用 `.node-version` 中的 Node 版本；`npm ci` 安装锁定依赖。桌面还需要 Rust、系统原生编译依赖和 Git，参见 [Tauri 环境要求](https://tauri.app/start/prerequisites/)。CI 固定 Rust 1.95.0。

Windows 本机项目、测试副本与缓存使用 F 盘；没有 F 盘的贡献者通过 `GITVIZ_TEST_ROOT`、`GITVIZ_PRODUCT_TEST_ROOT`、`GITVIZ_LARGE_TEST_ROOT`、`GITVIZ_DELIVERY_TEST_ROOT` 指定自己的临时目录。CI 使用 runner 临时目录，不依赖 F 盘。

```bash
npm run version:check
npm run lint
npm test
npm run extension:test
npm run dsh:test
npm run history:test
npm run extension:package
npm run dsh:package
npm run package:check
npm run delivery:test
```

Rust 检查在 `src-tauri` 下运行 `cargo check --locked --all-targets` 和 `cargo test --locked --lib -- --test-threads=1`。设置 `GITVIZ_HISTORY_FIXTURES` 为前一步生成的 `GITVIZ_LARGE_TEST_ROOT/report.json`，否则本地 Rust 大历史测试会明确跳过；CI 禁止跳过。

## 改动要求

- 一次处理一个明确问题，说明前后行为和验证范围。
- Git 写入必须经过预览、一次性确认和后端再次检查；不要让选择节点直接修改工作文件。
- 保留真实父关系、失败现场、备份和操作记录。写入测试只用临时合成仓库。
- 共享地图修改需要检查桌面、VS Code 和 DSH；构建通过不能代替宿主 UI 验证。
- 不提交 `node_modules`、原生构建目录、访问凭据、生成安装包或测试仓库。

版本由根 `package.json` 决定。用 `npm run version:set -- x.y.z` 同步三端和锁文件，再运行 `version:check`。不要只改一个插件版本。正式发布前还需完成 [公开产品验收](spec/modules/public-product.md)。

提交 PR 时写清问题、修改和已运行的检查；CI 在三个系统执行测试和打包。原生界面、安装升级及商店发布另行验证，不能把 CI 的通过状态当作这些流程已完成。

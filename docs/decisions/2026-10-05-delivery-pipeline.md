# 工程交付与打包门禁

基线 main / 51cb87e，工作树干净。本批只推进公开产品 P3 工程交付；自动 CI 与可审查产物属于已有完善和 push 授权，不自动发布商店或正式 Release。

- 建立 Windows / Linux / macOS CI：安装锁定依赖，lint、前端/真实 Git/DSH/大历史测试、Rust 检查和测试、三端构建。Rust 大历史测试必须消费本 job 生成的真实 fixture，不能静默跳过后报绿。
- Actions 固定完整 SHA，工作流仅 contents:read，不向 PR 提供发布秘密，不使用 pull_request_target；原生产仓库不作为测试对象。隔离测试目录使用 runner.temp，本机继续使用 F 盘。
- 当前开发版本统一为 0.3.0，根 package.json 为版本真源；检查 npm lock、VS Code、DSH、Tauri、Cargo manifest/lock 一致，明确尚未正式发行。
- VSIX 包含项目许可证、第三方声明与全部宿主 worker。固定 ZIP 时间戳、路径及权限；重复构建校验插件包内容与 SHA。不宣称不同操作系统的原生二进制逐字节相同。
- 自动产物含版本、源提交、平台/工具链记录与 SHA-256，Windows 准备 NSIS 安装包。先在 CI 产物中供审查，正式安装升级测试和最终发行属于后续门禁。
- 根许可证沿用已声明的 MIT/Harly；添加贡献指南与真实安全反馈入口，不承诺不存在的安全维护服务。
- 本机验证后提交并 push，观察真实 CI；失败按真实日志修复，不把工作流文件存在当成自动化通过。

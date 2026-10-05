# 提交签名验收

基线 `a576797`，`F:/gitviz` / main，开始时干净。P1 要求用户身份、hooks 和 signing 生效；现有 Node/Rust fixture 均配置 `commit.gpgsign=false`，缺少真实签名证据。

计划使用 fixture 自己生成的临时 SSH Ed25519 密钥，启用仓库级签名配置，通过真正的 Git 提交及 `git verify-commit` 检查产物。分别覆盖共享插件后端恢复提交、桌面编辑提交、无法读取签名密钥时保留 HEAD/内容/index/检查点，以及修正密钥配置后续交且签名有效。

密钥仅位于 F 盘合成测试仓库 `.git` 下，CI 使用 runner 临时目录；不读取用户密钥、不改全局 Git 配置。生成工具使用 OpenSSH `ssh-keygen`，缺失时测试失败而非跳过。生产不新增运行依赖；用户自行选择 Git 签名工具。

运行新增 Node/Rust 定向用例、必要的 Rust check 与 lint，CI 在三系统执行新增测试。SSH 证据不冒充所有 GPG/硬件密钥/密码输入方案均已验证；完整公开产品目标继续保持。

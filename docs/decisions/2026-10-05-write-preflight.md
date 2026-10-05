# 三端写入预检对齐

基线 main / 08240a1，工作树干净。继续完整公开交付目标，本批只处理预览/执行的写入预检差异。

- 插件切换、恢复和继续提交统一要求完整检出，与桌面既有边界一致；使用 Git boolean 默认值查询，不能把配置读取失败当作 false。创建分支和独立 worktree 不因此禁用。
- 三端修改当前工作文件前检查 `ls-files -v -z`，拒绝隐藏状态的 skip-worktree/assume-unchanged 标记；只提示检查，不自动清除标记或覆盖文件。[Git ls-files 文档](https://git-scm.com/docs/git-ls-files)定义 S 为 skip-worktree，小写状态为 assume-unchanged。
- 将插件恢复的稀疏、子模块、忽略文件碰撞、身份检查抽为预览与执行共用的只读检查，提前给出准确失败；执行仍重新检查。不得把预览视为锁住外部 Git 的事务。
- 三端状态检查显式使用 `--ignore-submodules=none`，不让用户的显示配置掩盖嵌套工作文件变化。继续提交对 index 检查也显式覆盖忽略子模块设置。
- 进行中 Git 操作标记使用每个 worktree 自己的 Git 路径；权限/访问错误不能当作标记不存在。
- 使用 F 盘合成仓库验证真实 sparse-checkout、真实本地子模块、linked worktree 状态标记、确认后配置变化和恢复前拒绝；检查 HEAD/index/文件/引用/记录不被意外修改。

依据：[git-status](https://git-scm.com/docs/git-status) 的 `--ignore-submodules=none` 覆盖 ignore 配置；[git-config](https://git-scm.com/docs/git-config) 的 `--default` 仅用于缺失值。此批不宣称增加完整子模块恢复支持，不关闭执行期间外部竞态、宿主退出、地图与发行验收。

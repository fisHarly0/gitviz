//! Desktop write transactions. Every action is previewed, bound to a repository
//! snapshot, confirmed once, and executed through Git (including user hooks).
use crate::SharedRepoState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, fs, io::Write, path::{Component, Path, PathBuf}, sync::{Arc, Mutex}, time::{Duration, Instant}};
#[cfg(test)] use std::process::Command;
use tauri::State;
use super::journal;

#[derive(Clone, Deserialize, Serialize)]
pub struct Expected { pub repo: String, pub head: String, pub branch: String }

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Action {
    SwitchBranch { name: String },
    CreateBranch { name: String, oid: String },
    ForkEdit { name: String, oid: String },
    SaveEdit { path: String, content: String, message: String },
    Restore { oid: String },
    CreateWorktree { name: String, oid: String, directory: String },
    ResumeCommit { id: String },
}

struct Plan { root: PathBuf, expected: Expected, action: Action, revision: String, target: Option<String>, checkpoint: Option<Value>, created: Instant }
#[derive(Default)]
pub struct Operations { plans: HashMap<String, Plan> }
pub type SharedOperations = Arc<Mutex<Operations>>;

pub(super) fn nonce() -> Result<String, String> {
    let mut bytes = [0u8; 16]; getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

pub(crate) fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    super::git_process::text(root, args, Duration::from_secs(120))
}

fn canonical(root: &Path) -> Result<PathBuf, String> { fs::canonicalize(root).map_err(|e|e.to_string()) }
fn head(root: &Path) -> Result<String, String> { Ok(git(root, &["rev-parse", "--verify", "HEAD"])?.trim().into()) }
fn branch(root: &Path) -> String { git(root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap_or_default().trim().into() }
fn oid(root: &Path, value: &str) -> Result<(), String> {
    if ![40, 64].contains(&value.len()) || !value.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("无效的提交编号。".into()); }
    if git(root, &["cat-file", "-t", value])?.trim() != "commit" { return Err("目标不是 Git 提交。".into()); }
    Ok(())
}
fn branch_name(root: &Path, name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 150 || name.starts_with('-') || name.contains("@{") { return Err("请输入有效的分支名。".into()); }
    git(root, &["check-ref-format", "--branch", name])?; Ok(())
}

fn guard(root: &Path, expected: &Expected, clean: bool) -> Result<(), String> {
    if canonical(root)? != canonical(Path::new(&expected.repo))? { return Err("当前仓库已变化，请重新预览操作。".into()); }
    if head(root)? != expected.head || branch(root) != expected.branch { return Err("当前分支或 HEAD 已变化，请刷新后重试。".into()); }
    if clean && !git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"])?.is_empty() { return Err("工作区有未提交或未跟踪文件，请先提交或暂存到 stash。".into()); }
    for marker in ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"] {
        let file = git(root, &["rev-parse", "--git-path", marker])?;
        if root.join(file.trim()).try_exists().map_err(|e|format!("无法检查 Git 操作状态：{e}"))? { return Err("仓库正在合并、变基或挑选提交，请先完成或中止。".into()); }
    }
    Ok(())
}

/// Reject traversal, metadata, Windows ADS/devices and symlinks/junctions at
/// every component. Editing supports existing tracked regular files only.
pub(crate) fn edit_path(root: &Path, value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.contains(['\\', ':', '\0']) || Path::new(value).is_absolute() { return Err("无效的仓库相对路径。".into()); }
    for part in value.split('/') {
        let lower = part.to_ascii_lowercase(); let stem = lower.split('.').next().unwrap_or("");
        if part.is_empty() || matches!(part, "." | "..") || part.ends_with([' ', '.']) || lower == ".git" || lower.starts_with("git~") || matches!(stem, "con" | "prn" | "aux" | "nul") || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4 && stem.as_bytes()[3].is_ascii_digit()) { return Err("此路径指向仓库外、Git 元数据或保留文件名。".into()); }
    }
    if Path::new(value).components().any(|c| !matches!(c, Component::Normal(_))) { return Err("无效路径。".into()); }
    let base = canonical(root)?; let mut full = base.clone();
    for part in value.split('/') {
        full.push(part); let info = fs::symlink_metadata(&full).map_err(|e|format!("无法访问编辑文件：{e}"))?;
        if info.file_type().is_symlink() { return Err("不支持编辑符号链接或经过链接的路径。".into()); }
        #[cfg(windows)] {
            use std::os::windows::fs::MetadataExt;
            if info.file_attributes() & 0x400 != 0 { return Err("不支持编辑经过 Windows 重解析点的路径。".into()); }
        }
        if !canonical(&full)?.starts_with(&base) { return Err("编辑路径超出仓库。".into()); }
    }
    if !full.is_file() { return Err("只支持编辑普通文件。".into()); }
    let entry = git(root, &["ls-tree", "-z", "HEAD", "--", value])?;
    if !(entry.starts_with("100644 blob ") || entry.starts_with("100755 blob ")) { return Err("只支持编辑已跟踪的普通文件。".into()); }
    Ok(full)
}

fn identity(root: &Path) -> Result<(), String> { git(root, &["var", "GIT_AUTHOR_IDENT"])?; git(root, &["var", "GIT_COMMITTER_IDENT"])?; Ok(()) }
fn full_checkout(root: &Path) -> Result<(), String> {
    if git(root, &["config", "--bool", "--default=false", "--get", "core.sparseCheckout"])?.trim() == "true" { return Err("稀疏检出仓库暂不支持此操作，请先在 Git 中恢复完整检出。".into()); }
    if git(root, &["ls-files", "-v", "-z"])?.split('\0').any(|entry| entry.as_bytes().first().is_some_and(|b| *b == b'S' || b.is_ascii_lowercase())) {
        return Err("暂存区包含 skip-worktree 或 assume-unchanged 标记，可能隐藏文件改动。请先在 Git 中检查并处理这些标记。".into());
    }
    Ok(())
}

fn check_checkpoint(root: &Path, record: &Value, expected: &Expected) -> Result<(), String> {
    if record["before"]["head"] != expected.head || record["before"]["branch"] != expected.branch { return Err("当前位置与失败操作的起点不同，请检查记录和 Git 状态。".into()); }
    guard(root,expected,false)?; full_checkout(root)?; identity(root)?;
    if expected.branch.is_empty() { return Err("游离 HEAD 不能继续提交。".into()); }
    let tree = record["checkpoint"]["tree"].as_str().ok_or("提交检查点缺少 tree。")?;
    let message = record["checkpoint"]["message"].as_str().ok_or("提交检查点缺少说明。")?;
    if ![40,64].contains(&tree.len()) || !tree.bytes().all(|b|b.is_ascii_hexdigit()) || message.trim().is_empty() || message.len() > 2000 || message.contains('\0') { return Err("提交检查点无效，请手动检查 Git 状态。".into()); }
    if git(root,&["cat-file","-t",tree])?.trim() != "tree" { return Err("提交检查点不是 Git tree。".into()); }
    if let Some(backup) = record["backup"].as_str() {
        branch_name(root,backup)?;
        if git(root,&["rev-parse","--verify",&format!("refs/heads/{backup}")])?.trim() != expected.head { return Err("备份引用已变化，请先检查恢复前的位置。".into()); }
    }
    git(root,&["diff","--cached","--quiet","--no-ext-diff","--no-textconv","--ignore-submodules=none",tree,"--"]).map_err(|_|"暂存区与失败时的检查点不同，请先检查差异；不会提交新增改动。".to_owned())?;
    git(root,&["diff","--quiet","--no-ext-diff","--no-textconv","--ignore-submodules=none","--"]).map_err(|_|"工作文件在失败后发生变化，请先检查差异；不会自动暂存。".to_owned())?;
    if !git(root,&["ls-files","--others","--exclude-standard","-z"])?.is_empty() { return Err("存在未跟踪文件，请先处理后再继续提交。".into()); }
    Ok(())
}
fn pending_commit(root: &Path, id: &str, expected: &Expected) -> Result<Value, String> {
    let record = journal::read(root,id)?;
    if record["state"] != "failed" || !matches!(record["action"].as_str(),Some("restore" | "saveEdit")) || !record["checkpoint"].is_object() { return Err("该记录没有可继续的失败提交。".into()); }
    check_checkpoint(root,&record,expected)?; Ok(record)
}

fn validate(root: &Path, expected: &Expected, action: &Action) -> Result<Value, String> {
    if let Action::ResumeCommit { id } = action {
        let record = pending_commit(root,id,expected)?;
        let files: Vec<String> = git(root,&["diff","--cached","--name-only","-z","--"])?.split('\0').filter(|s|!s.is_empty()).map(str::to_owned).collect();
        return Ok(json!({"title":"继续失败的提交","confirmLabel":"检查并继续提交","impact":"仅提交与失败检查点完全一致的暂存内容；不会自动暂存新的改动。Git 身份、签名和钩子继续生效。","expected":expected,"files":files,"target":record["params"]["oid"],"operationId":id,"checkpoint":record["checkpoint"]}));
    }
    let clean = !matches!(action, Action::CreateBranch { .. } | Action::CreateWorktree { .. });
    guard(root, expected, clean)?;
    let mut target = None;
    match action {
        Action::SwitchBranch { name } => { branch_name(root, name)?; let id = git(root, &["rev-parse", "--verify", &format!("refs/heads/{name}")])?; target = Some(id.trim().to_owned()); full_checkout(root)?; }
        Action::CreateBranch { name, oid: id } | Action::ForkEdit { name, oid: id } | Action::CreateWorktree { name, oid: id, .. } => {
            branch_name(root, name)?; oid(root, id)?;
            if git(root, &["show-ref", "--verify", &format!("refs/heads/{name}")]).is_ok() { return Err("分支名已存在，请选择其他名称。".into()); }
            target = Some(id.clone());
            if matches!(action, Action::ForkEdit { .. }) { full_checkout(root)?; }
            if let Action::CreateWorktree { directory, .. } = action { if !Path::new(directory).is_absolute() { return Err("试验目录必须是绝对路径。".into()); } }
        }
        Action::SaveEdit { path, content, message } => {
            if expected.branch.is_empty() { return Err("请先切换到分支再提交。".into()); }
            if content.len() > 2 * 1024 * 1024 || content.contains('\0') { return Err("只支持不超过 2 MB 的文本编辑。".into()); }
            if message.trim().is_empty() || message.len() > 2000 || message.contains('\0') { return Err("请输入有效的提交说明。".into()); }
            full_checkout(root)?; edit_path(root, path)?; identity(root)?;
        }
        Action::Restore { oid: id } => {
            oid(root, id)?; full_checkout(root)?; identity(root)?;
            if expected.branch.is_empty() { return Err("游离 HEAD 暂不支持恢复，请先切换到分支。".into()); }
            let target_tree = git(root, &["ls-tree", "-r", "-z", id])?;
            let current_tree = git(root, &["ls-tree", "-r", "-z", &expected.head])?;
            if target_tree.split('\0').chain(current_tree.split('\0')).any(|s|s.starts_with("160000 ")) { return Err("包含子模块的版本暂不支持整树恢复。".into()); }
            let ignored = git(root, &["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])?;
            let paths: Vec<_> = target_tree.split('\0').filter_map(|s|s.split_once('\t').map(|(_,p)|p)).collect();
            for file in ignored.split('\0').filter(|s|!s.is_empty()) {
                if paths.iter().any(|p|file == *p || file.starts_with(&format!("{p}/")) || p.starts_with(&format!("{file}/"))) { return Err(format!("恢复会覆盖被忽略的文件：{file}")); }
            }
            if git(root, &["rev-parse", &format!("{id}^{{tree}}")])? == git(root, &["rev-parse", "HEAD^{tree}"])? { return Err("文件内容相同，无需恢复。".into()); }
            target = Some(id.clone());
        }
        Action::ResumeCommit { .. } => unreachable!(),
    }
    let files = if let Some(id) = &target { git(root, &["diff", "--name-only", "-z", &expected.head, id, "--"])? .split('\0').filter(|s|!s.is_empty()).map(str::to_owned).collect::<Vec<_>>() } else if let Action::SaveEdit { path, .. } = action { vec![path.clone()] } else { vec![] };
    let impact = match action {
        Action::SwitchBranch { .. } => "切换真实分支，并同步暂存区与工作文件。",
        Action::ForkEdit { .. } => "创建试验分支，并把当前工作目录切换到选中的存档。",
        Action::SaveEdit { .. } => "写入当前编辑文件并创建提交。Git 身份、签名和钩子仍生效。",
        Action::Restore { .. } => "先建立备份分支，再恢复文件并创建新提交，后续历史保留。",
        Action::CreateBranch { .. } => "增加分支引用，当前工作文件保持不变。",
        Action::CreateWorktree { .. } => "新建独立工作目录，原工作目录保持不变。",
        Action::ResumeCommit { .. } => unreachable!(),
    };
    let (title, confirm_label) = match action {
        Action::CreateBranch { .. } => ("创建分支", "确认创建分支"),
        Action::CreateWorktree { .. } => ("从此存档创建试验工作区", "确认创建工作区"),
        Action::Restore { .. } => ("恢复此存档", "备份并恢复"),
        _ => ("确认 Git 操作", "确认操作"),
    };
    let mut preview = json!({"title":title,"confirmLabel":confirm_label,"impact":impact,"files":files,"target":target,"expected":expected});
    match action {
        Action::SwitchBranch { name } | Action::CreateBranch { name, .. } | Action::ForkEdit { name, .. } | Action::CreateWorktree { name, .. } => { preview["branchName"] = json!(name); }
        _ => {}
    }
    if let Action::CreateWorktree { directory, .. } = action { preview["directory"] = json!(directory); }
    preview["filesLabel"] = json!(if matches!(action, Action::CreateBranch { .. } | Action::CreateWorktree { .. }) { "目标存档与当前 HEAD 的差异（原目录不变）" } else { "将更新的文件" });
    Ok(preview)
}

fn outcome_error(detail: &str) -> String {
    format!("Git 操作结果与确认不一致：{detail}。外部 Git 或钩子可能改变了现场；已产生的提交、分支和文件保留，请刷新并检查操作记录，不要直接重试。")
}
fn verify_position(root: &Path, expected: &Expected) -> Result<(), String> {
    let reference = git(root, &["rev-parse", "--symbolic-full-name", "HEAD"])?;
    let expected_ref = if expected.branch.is_empty() { "HEAD".into() } else { format!("refs/heads/{}", expected.branch) };
    if head(root)? != expected.head || reference.trim() != expected_ref { return Err(outcome_error("实际 HEAD 或分支已变化")); }
    Ok(())
}
fn verify_checkout(root: &Path, expected: &Expected) -> Result<(), String> {
    verify_position(root, expected)?;
    if !git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"])?.is_empty() { return Err(outcome_error("切换或提交后工作区仍有改动")); }
    verify_position(root, expected)
}
fn verify_commit(root: &Path, record: &Value, expected: &Expected) -> Result<(), String> {
    let actual = head(root)?;
    if git(root, &["show", "-s", "--format=%P", &actual, "--"])?.trim() != expected.head { return Err(outcome_error("新提交的父提交不是确认时的起点")); }
    if git(root, &["rev-parse", &format!("{actual}^{{tree}}")])?.trim() != record["checkpoint"]["tree"].as_str().ok_or("缺少提交检查点。")? { return Err(outcome_error("新提交内容不同于提交前检查点")); }
    if let Some(backup) = record["backup"].as_str() {
        if git(root, &["rev-parse", "--verify", &format!("refs/heads/{backup}")])?.trim() != expected.head { return Err(outcome_error("备份引用已变化")); }
    }
    verify_checkout(root, &Expected { repo: expected.repo.clone(), head: actual, branch: expected.branch.clone() })
}

struct OperationLock { file: PathBuf, root: PathBuf }
impl Drop for OperationLock { fn drop(&mut self) { if !super::git_process::is_uncertain(&self.root) { let _ = fs::remove_file(&self.file); } } }
fn lock_repo(root: &Path) -> Result<OperationLock, String> {
    if super::git_process::is_uncertain(root) { return Err("上次 Git 进程状态尚未确认，本会话不能继续写入。请检查进程、Git 状态和保留的操作锁。".into()); }
    let path = root.join(git(root, &["rev-parse", "--git-path", "gitviz-operation.lock"])?.trim());
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| "另一个 Gitviz 写操作正在进行。如果上次异常退出，请检查 Git 状态后删除 .git/gitviz-operation.lock。".to_owned())?;
    write!(file, "{}", std::process::id()).map_err(|e|e.to_string())?; Ok(OperationLock { file: path, root: root.to_path_buf() })
}

fn execute_action(root: &Path, expected: &Expected, action: &Action, target: Option<&str>, checkpoint: Option<&Value>) -> Result<Value, String> {
    let _lock = lock_repo(root)?; let preview = validate(root, expected, action)?;
    if preview["target"].as_str() != target { return Err("目标存档已变化，请重新预览。".into()); }
    if let Action::ResumeCommit { id } = action { if Some(&journal::read(root,id)?["checkpoint"]) != checkpoint { return Err("失败检查点已变化，请重新预览。".into()); } }
    let mut record = if let Action::ResumeCommit { id } = action {
        let mut record = pending_commit(root,id,expected)?;
        record["state"] = json!("running"); record["attempts"] = json!(record["attempts"].as_u64().unwrap_or(1).saturating_add(1)); record["updatedAt"] = json!(journal::now());
        journal::save(root,&record)?; record
    } else { journal::begin(root,expected,serde_json::to_value(action).map_err(|e|e.to_string())?)? };
    let outcome = (|| -> Result<Value,String> {
    let mut result = json!({});
    match action {
        Action::SwitchBranch { name } => {
            git(root, &["switch", "--no-guess", "--no-overwrite-ignore", "--", name])?;
            verify_checkout(root, &Expected { repo: expected.repo.clone(), head: target.ok_or("缺少确认目标。")?.into(), branch: name.clone() })?;
        }
        Action::CreateBranch { name, oid } => {
            git(root, &["branch", "--", name, oid])?;
            if git(root, &["rev-parse", "--verify", &format!("refs/heads/{name}")])?.trim() != oid { return Err(outcome_error("新分支没有指向确认的存档")); }
            verify_position(root, expected)?;
        }
        Action::ForkEdit { name, oid } => {
            git(root, &["switch", "--no-overwrite-ignore", "-c", name, oid])?;
            verify_checkout(root, &Expected { repo: expected.repo.clone(), head: oid.clone(), branch: name.clone() })?;
        }
        Action::CreateWorktree { name, oid, directory } => {
            fs::create_dir_all(directory).map_err(|e|e.to_string())?;
            let folder = Path::new(directory).join(format!("gitviz-{}-{}", &oid[..7], &nonce()?[..8]));
            record["worktree"] = json!(folder.to_string_lossy()); journal::save(root,&record)?;
            git(root, &["worktree", "add", "-b", name, "--", &folder.to_string_lossy(), oid])?;
            verify_checkout(&folder, &Expected { repo: folder.to_string_lossy().into_owned(), head: oid.clone(), branch: name.clone() })?;
            verify_position(root, expected)?;
            result["worktree"] = json!(folder.to_string_lossy());
        }
        Action::SaveEdit { path, content, message } => {
            let full = edit_path(root, path)?;
            let previous = fs::read(&full).map_err(|e|e.to_string())?;
            if previous == content.as_bytes() { return Err("文件内容没有变化。".into()); }
            // Replace one file atomically instead of truncating its inode: this
            // also avoids modifying another path that hard-links to this file.
            guard(root, expected, true)?;
            let permissions = fs::metadata(&full).map_err(|e|e.to_string())?.permissions();
            if permissions.readonly() { return Err("文件为只读，请先检查文件权限。".into()); }
            let temporary = full.parent().unwrap().join(format!(".gitviz-edit-{}.tmp", nonce()?));
            let saved_file = (|| -> Result<(), String> {
                let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
                file.set_permissions(permissions).map_err(|e|e.to_string())?;
                file.write_all(content.as_bytes()).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?; drop(file);
                if edit_path(root, path)? != full || fs::read(&full).map_err(|e|e.to_string())? != previous { return Err("编辑文件已被外部修改。".into()); }
                guard(root, expected, false)?;
                fs::rename(&temporary, &full).map_err(|e|e.to_string())?; Ok(())
            })();
            if let Err(error) = saved_file { return Err(format!("保存失败：{error}\n请保留编辑器内容。若临时文件存在，可从 {} 取回内容。", temporary.display())); }
            let saved = (|| -> Result<(), String> {
                guard(root, expected, false)?;
                git(root, &["add", "--", path])?;
                if fs::read(&full).map_err(|e|e.to_string())? != content.as_bytes() { return Err(outcome_error("编辑文件在暂存期间被修改，尚未提交")); }
                let staged_paths = git(root, &["diff", "--cached", "--name-only", "--no-renames", "--ignore-submodules=none", "-z", &expected.head, "--"])?;
                if staged_paths.split('\0').filter(|p|!p.is_empty()).any(|p|p != path) { return Err(outcome_error("暂存区混入其他文件，尚未提交")); }
                journal::checkpoint(root,&mut record,message)?;
                check_checkpoint(root,&record,expected)?;
                git(root, &["commit", "--only", "-m", message, "--", path])?;
                verify_commit(root,&record,expected)?;
                Ok(())
            })();
            if let Err(error) = saved { return Err(format!("提交未完成：{error}\n编辑内容已保留在工作文件或暂存区，未自动丢弃。请检查 Git 状态，解决身份、钩子或签名问题后继续提交。")); }
        }
        Action::Restore { oid } => {
            let backup = format!("gitviz/backup-{}", nonce()?);
            record["backup"] = json!(backup); journal::save(root,&record)?;
            git(root, &["branch", "--", &backup, &expected.head])?;
            let restored = (|| -> Result<(), String> {
                guard(root, expected, true)?;
                git(root, &["restore", &format!("--source={oid}"), "--staged", "--worktree", "--", "."])?;
                let message = format!("Restore snapshot {}\n\nPrevious HEAD preserved on {backup}.", &oid[..7]);
                journal::checkpoint(root,&mut record,&message)?;
                if git(root, &["rev-parse", &format!("{oid}^{{tree}}")])?.trim() != record["checkpoint"]["tree"].as_str().unwrap_or("") { record["checkpoint"] = Value::Null; return Err(outcome_error("恢复暂存内容不同于目标存档，尚未提交")); }
                check_checkpoint(root,&record,expected)?;
                git(root, &["commit", "-m", &message])?;
                verify_commit(root,&record,expected)?;
                Ok(())
            })();
            if let Err(error) = restored { return Err(format!("恢复未完成：{error}\n恢复前版本在 {backup}；已产生的文件和暂存更改保留，请检查 Git 状态。")); }
            result["backup"] = json!(backup);
        }
        Action::ResumeCommit { .. } => {
            check_checkpoint(root,&record,expected)?;
            git(root,&["commit","-m",record["checkpoint"]["message"].as_str().ok_or("缺少提交说明。")?])?;
            verify_commit(root,&record,expected)?;
            result["backup"] = record["backup"].clone();
        }
    }
    result["head"] = json!(head(root)?); result["branch"] = json!(branch(root));
    result["repo"] = json!(root.to_string_lossy()); result["message"] = json!("操作完成，实际 Git 状态已更新。");
    Ok(result)
    })();
    if let Err(error) = journal::finish(root,&mut record,&outcome) {
        return Err(format!("{}\n操作记录更新失败：{error}。请检查实际 Git 状态。", outcome.as_ref().err().map(String::as_str).unwrap_or("Git 操作已执行。")));
    }
    match outcome {
        Ok(mut result) => { result["operationId"] = record["id"].clone(); Ok(result) }
        Err(error) => Err(format!("{error}\n操作记录：{}",record["id"].as_str().unwrap_or(""))),
    }
}

fn preview_at_revision(root: &Path, expected: &Expected, action: &Action, revision: &str) -> Result<Value, String> {
    let preview = validate(root, expected, action)?;
    if super::history::snapshot(root, 20)?["revision"] != revision { return Err("历史已变化，请重新预览操作。".into()); }
    Ok(preview)
}

impl Operations {
    pub fn prepare(&mut self, root: &Path, expected: Expected, action: Action) -> Result<Value, String> {
        self.plans.retain(|_,p|p.created.elapsed() < Duration::from_secs(300));
        if self.plans.len() >= 32 { return Err("待确认操作过多，请稍后重试。".into()); }
        let revision = super::history::snapshot(root, 20)?["revision"].as_str().unwrap().to_owned();
        let mut preview = preview_at_revision(root, &expected, &action, &revision)?;
        let token = nonce()?;
        let checkpoint = if matches!(action,Action::ResumeCommit { .. }) {Some(preview["checkpoint"].clone())} else {None};
        let target = preview["target"].as_str().map(str::to_owned);
        self.plans.insert(token.clone(), Plan { root: canonical(root)?, expected, action, revision, target, checkpoint, created: Instant::now() });
        preview["token"] = json!(token); Ok(preview)
    }
    pub fn execute(&mut self, root: &Path, token: &str) -> Result<Value, String> {
        let plan = self.plans.remove(token).ok_or("确认已使用或失效，请重新预览。")?;
        if plan.created.elapsed() >= Duration::from_secs(300) { return Err("确认已过期，请重新预览。".into()); }
        if canonical(root)? != plan.root { return Err("仓库已变化，不能执行旧操作。".into()); }
        if super::history::snapshot(root, 20)?["revision"] != plan.revision { return Err("历史已变化，请重新预览操作。".into()); }
        execute_action(root, &plan.expected, &plan.action, plan.target.as_deref(), plan.checkpoint.as_ref())
    }
}

#[tauri::command]
pub async fn desktop_prepare(state: State<'_, SharedRepoState>, operations: State<'_, SharedOperations>, expected: Expected, action: Action) -> Result<Value, String> {
    let shared = state.inner().clone(); let operations = operations.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = shared.lock().map_err(|e|e.to_string())?;
        let root = &state.as_ref().ok_or("请先打开仓库。")?.repo_path;
        operations.try_lock().map_err(|_|"另一个操作正在进行，请稍后重试。".to_owned())?.prepare(root, expected, action)
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn desktop_execute(state: State<'_, SharedRepoState>, operations: State<'_, SharedOperations>, token: String) -> Result<Value, String> {
    let shared = state.inner().clone(); let operations = operations.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = shared.lock().map_err(|e|e.to_string())?;
        let root = &state.as_ref().ok_or("请先打开仓库。")?.repo_path;
        operations.try_lock().map_err(|_|"另一个操作正在进行，请稍后重试。".to_owned())?.execute(root, &token)
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn desktop_cancel(operations: State<'_, SharedOperations>, token: String) -> Result<(), String> {
    operations.try_lock().map_err(|_|"另一个操作正在进行。".to_owned())?.plans.remove(&token);
    Ok(())
}

#[tauri::command]
pub async fn desktop_operations(state: State<'_, SharedRepoState>, before: Option<String>, limit: Option<usize>) -> Result<Value,String> {
    let root = super::current_repo_path(&state)?;
    tauri::async_runtime::spawn_blocking(move || journal::list(&root,before.as_deref(),limit.unwrap_or(30))).await.map_err(|e|e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture { root: PathBuf, first: String, latest: String }
    impl Fixture {
        fn new() -> Self {
            let parent = std::env::var_os("GITVIZ_PRODUCT_TEST_ROOT").map(PathBuf::from).unwrap_or_else(|| {
                if cfg!(windows) { PathBuf::from("F:/Codex/work/gitviz-product") } else { std::env::temp_dir().join("gitviz-product") }
            });
            let root = parent.join(format!("writes-{}", nonce().unwrap())); fs::create_dir_all(&root).unwrap();
            git(&root, &["init", "-b", "main"]).unwrap();
            for (key, value) in [("user.name", "Fixture Author"), ("user.email", "fixture@example.invalid"), ("commit.gpgsign", "false"), ("core.autocrlf", "false"), ("core.hooksPath", ".git/hooks")] { git(&root, &["config", key, value]).unwrap(); }
            fs::write(root.join("中文.txt"), "first\n").unwrap(); fs::write(root.join("deleted.txt"), "restore me\n").unwrap();
            git(&root, &["add", "."]).unwrap(); git(&root, &["commit", "-m", "first"]).unwrap(); let first = head(&root).unwrap();
            fs::write(root.join("中文.txt"), "second\n").unwrap(); fs::remove_file(root.join("deleted.txt")).unwrap(); fs::write(root.join("added.txt"), "new file\n").unwrap();
            git(&root, &["add", "."]).unwrap(); git(&root, &["commit", "-m", "second"]).unwrap(); let latest = head(&root).unwrap();
            Self { root, first, latest }
        }
        fn expected(&self) -> Expected { Expected { repo: self.root.to_string_lossy().into_owned(), head: head(&self.root).unwrap(), branch: branch(&self.root) } }
        fn perform(&self, action: Action) -> Result<Value, String> {
            let mut ops = Operations::default(); let plan = ops.prepare(&self.root, self.expected(), action)?;
            ops.execute(&self.root, plan["token"].as_str().unwrap())
        }
        fn save(&self, content: &str) -> Action { Action::SaveEdit { path: "中文.txt".into(), content: content.into(), message: "edit safely".into() } }
    }
    #[test]
    fn outcome_restore_rechecks_position_after_backup_reference_hook() {
        let f = Fixture::new();
        git(&f.root, &["branch", "other", &f.first]).unwrap();
        let hook = f.root.join(".git/hooks/reference-transaction");
        fs::write(&hook, "#!/bin/sh\nif test \"$1\" != committed; then exit 0; fi\nwhile read old new ref; do\ncase \"$ref\" in refs/heads/gitviz/backup-*) git symbolic-ref HEAD refs/heads/other;; esac\ndone\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(Action::Restore { oid: f.first.clone() }).unwrap_err().contains("HEAD 已变化"));
        assert_eq!(head(&f.root).unwrap(), f.first); assert_eq!(branch(&f.root), "other");
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "second\n");
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert!(record["checkpoint"].is_null());
        assert_eq!(git(&f.root, &["rev-parse", record["backup"].as_str().unwrap()]).unwrap().trim(), f.latest);
    }
    #[test]
    fn outcome_post_checkout_changes_are_reported_with_actual_position() {
        let f = Fixture::new();
        git(&f.root, &["branch", "other", &f.first]).unwrap();
        let hook = f.root.join(".git/hooks/post-checkout");
        fs::write(&hook, "#!/bin/sh\ngit symbolic-ref HEAD refs/heads/main\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(Action::SwitchBranch { name: "other".into() }).unwrap_err().contains("结果与确认不一致"));
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(branch(&f.root), "main");
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "first\n");
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert_eq!(record["result"]["head"], f.latest); assert_eq!(record["result"]["branch"], "main");
    }
    #[test]
    fn outcome_post_commit_replacement_with_same_tree_and_wrong_parent_is_detected() {
        let f = Fixture::new();
        let tree = git(&f.root, &["rev-parse", &format!("{}^{{tree}}", f.first)]).unwrap();
        let replacement = git(&f.root, &["commit-tree", tree.trim(), "-p", &f.first, "-m", "external replacement"]).unwrap().trim().to_owned();
        let hook = f.root.join(".git/hooks/post-commit");
        fs::write(&hook, format!("#!/bin/sh\ngit rev-parse HEAD > .git/created-by-gitviz\ngit update-ref HEAD {replacement}\n")).unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(Action::Restore { oid: f.first.clone() }).unwrap_err().contains("父提交"));
        let created = fs::read_to_string(f.root.join(".git/created-by-gitviz")).unwrap();
        assert_eq!(git(&f.root, &["rev-parse", &format!("{}^", created.trim())]).unwrap().trim(), f.latest);
        assert_eq!(head(&f.root).unwrap(), replacement);
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "first\n");
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert_eq!(record["result"]["head"], replacement);
        assert_eq!(git(&f.root, &["rev-parse", record["backup"].as_str().unwrap()]).unwrap().trim(), f.latest);
        assert!(pending_commit(&f.root,record["id"].as_str().unwrap(),&f.expected()).unwrap_err().contains("起点不同"));
    }
    #[test]
    fn outcome_edit_rejects_post_index_hook_staging_other_files() {
        let f = Fixture::new(); let hook = f.root.join(".git/hooks/post-index-change");
        fs::write(&hook, "#!/bin/sh\nif test -f .git/race-fired; then exit 0; fi\nprintf fired > .git/race-fired\nprintf external-staging > external.txt\ngit add -- external.txt\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(f.save("my edit\n")).unwrap_err().contains("暂存区混入其他文件"));
        assert_eq!(head(&f.root).unwrap(), f.latest);
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "my edit\n");
        assert_eq!(fs::read_to_string(f.root.join("external.txt")).unwrap(), "external-staging");
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert!(record["checkpoint"].is_null());
        assert!(pending_commit(&f.root,record["id"].as_str().unwrap(),&f.expected()).is_err());
    }
    #[test]
    fn outcome_restore_rejects_post_index_hook_staging_before_commit() {
        let f = Fixture::new(); let hook = f.root.join(".git/hooks/post-index-change");
        fs::write(&hook, "#!/bin/sh\nif test -f .git/race-fired; then exit 0; fi\nprintf fired > .git/race-fired\nprintf external-staging > external.txt\ngit add -- external.txt\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(Action::Restore { oid: f.first.clone() }).unwrap_err().contains("恢复暂存内容不同"));
        assert_eq!(head(&f.root).unwrap(), f.latest);
        assert_eq!(fs::read_to_string(f.root.join("external.txt")).unwrap(), "external-staging");
        assert!(git(&f.root, &["diff", "--cached", "--name-only"]).unwrap().contains("external.txt"));
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert!(record["checkpoint"].is_null());
        assert!(pending_commit(&f.root,record["id"].as_str().unwrap(),&f.expected()).unwrap_err().contains("没有可继续"));
    }
    #[test]
    fn outcome_worktree_hook_changes_preserve_new_directory_and_original_repo() {
        let f = Fixture::new(); let hooks = f.root.join(".git/hooks");
        git(&f.root, &["config", "core.hooksPath", hooks.to_str().unwrap()]).unwrap();
        let hook = hooks.join("post-checkout");
        fs::write(&hook, "#!/bin/sh\nprintf hook-change > added.txt\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        assert!(f.perform(Action::CreateWorktree { name: "trial-hook".into(), oid: f.latest.clone(), directory: f.root.with_extension("trials").to_string_lossy().into_owned() }).unwrap_err().contains("工作区仍有改动"));
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed");
        let folder = Path::new(record["worktree"].as_str().unwrap());
        assert_eq!(fs::read_to_string(folder.join("added.txt")).unwrap(), "hook-change");
        assert_eq!(fs::read_to_string(f.root.join("added.txt")).unwrap(), "new file\n");
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(branch(&f.root), "main");
        assert_eq!(git(&f.root, &["rev-parse", "refs/heads/trial-hook"]).unwrap().trim(), f.latest);
    }
    #[test]
    fn preflight_sparse_checkout_rejects_preview_and_confirmation_without_touching_files() {
        let f = Fixture::new(); let mut ops = Operations::default();
        git(&f.root, &["branch", "other", &f.first]).unwrap();
        let plan = ops.prepare(&f.root, f.expected(), Action::SwitchBranch { name: "other".into() }).unwrap();
        git(&f.root, &["sparse-checkout", "set", "--cone", "empty-directory"]).unwrap();
        let index = fs::read(f.root.join(".git/index")).unwrap();
        assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("稀疏"));
        for action in [Action::SwitchBranch { name: "other".into() }, Action::Restore { oid: f.first.clone() }, f.save("blocked\n")] {
            assert!(ops.prepare(&f.root, f.expected(), action).unwrap_err().contains("稀疏"));
        }
        assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(branch(&f.root), "main");
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "second\n");
        assert!(!f.root.join(".git/gitviz/operations").exists());
        f.perform(Action::CreateBranch { name: "sparse-safe".into(), oid: f.first.clone() }).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest);
        // Invalid configuration is an error, never equivalent to full checkout.
        git(&f.root, &["config", "core.sparseCheckout", "invalid-boolean"]).unwrap();
        assert!(full_checkout(&f.root).is_err());
    }
    #[test]
    fn preflight_index_flags_cannot_hide_worktree_changes() {
        let f = Fixture::new(); let mut ops = Operations::default();
        git(&f.root, &["branch", "other", &f.first]).unwrap();
        for flag in ["assume-unchanged", "skip-worktree"] {
            let plan = ops.prepare(&f.root, f.expected(), Action::SwitchBranch { name: "other".into() }).unwrap();
            git(&f.root, &["update-index", &format!("--{flag}"), "--", "中文.txt"]).unwrap();
            fs::write(f.root.join("中文.txt"), "hidden change\n").unwrap();
            assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
            let index = fs::read(f.root.join(".git/index")).unwrap();
            assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("标记"));
            assert!(ops.prepare(&f.root, f.expected(), Action::Restore { oid: f.first.clone() }).unwrap_err().contains("标记"));
            assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
            assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "hidden change\n");
            assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(branch(&f.root), "main");
            fs::write(f.root.join("中文.txt"), "second\n").unwrap();
            git(&f.root, &["update-index", &format!("--no-{flag}"), "--", "中文.txt"]).unwrap();
        }
        assert!(!f.root.join(".git/gitviz/operations").exists());
    }
    #[test]
    fn preflight_submodule_ignore_cannot_hide_dirty_files_or_allow_tree_restore() {
        let f = Fixture::new(); let nested = Fixture::new(); let mut ops = Operations::default();
        git(&f.root, &["-c", "protocol.file.allow=always", "submodule", "add", nested.root.to_str().unwrap(), "module"]).unwrap();
        git(&f.root, &["commit", "-am", "with module"]).unwrap();
        let expected = f.expected();
        git(&f.root, &["branch", "other", &expected.head]).unwrap();
        assert!(ops.prepare(&f.root, f.expected(), Action::Restore { oid: f.first.clone() }).unwrap_err().contains("子模块"));
        let plan = ops.prepare(&f.root, f.expected(), Action::SwitchBranch { name: "other".into() }).unwrap();
        git(&f.root, &["config", "submodule.module.ignore", "all"]).unwrap();
        git(&f.root, &["config", "diff.ignoreSubmodules", "all"]).unwrap();
        fs::write(f.root.join("module/中文.txt"), "keep nested change\n").unwrap();
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
        assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("未提交"));
        assert!(ops.prepare(&f.root, f.expected(), Action::SwitchBranch { name: "other".into() }).unwrap_err().contains("未提交"));
        assert_eq!(head(&f.root).unwrap(), expected.head); assert_eq!(branch(&f.root), "main");
        assert_eq!(fs::read_to_string(f.root.join("module/中文.txt")).unwrap(), "keep nested change\n");
        assert!(!f.root.join(".git/gitviz/operations").exists());
    }
    #[test]
    fn preflight_linked_worktree_markers_are_checked_before_preview_and_execution() {
        let f = Fixture::new(); let folder = f.root.with_extension("linked");
        git(&f.root, &["worktree", "add", "-b", "linked", folder.to_str().unwrap(), &f.latest]).unwrap();
        let expected = Expected { repo: folder.to_string_lossy().into_owned(), head: f.latest.clone(), branch: "linked".into() };
        let mut ops = Operations::default();
        for marker in ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"] {
            let action = || Action::CreateBranch { name: "blocked".into(), oid: f.first.clone() };
            let plan = ops.prepare(&folder, expected.clone(), action()).unwrap();
            let file = folder.join(git(&folder, &["rev-parse", "--git-path", marker]).unwrap().trim());
            let directory = matches!(marker, "rebase-merge" | "rebase-apply" | "sequencer");
            if directory { fs::create_dir(&file).unwrap(); } else { fs::write(&file, format!("{}\n", f.first)).unwrap(); }
            assert!(ops.execute(&folder, plan["token"].as_str().unwrap()).unwrap_err().contains("合并、变基"));
            assert!(ops.prepare(&folder, expected.clone(), action()).unwrap_err().contains("合并、变基"));
            if directory { fs::remove_dir(&file).unwrap(); } else { fs::remove_file(&file).unwrap(); }
        }
        assert_eq!(head(&folder).unwrap(), f.latest);
        assert!(git(&folder, &["show-ref", "--verify", "refs/heads/blocked"]).is_err());
        assert!(journal::list(&folder, None, 30).unwrap()["records"].as_array().unwrap().is_empty());
    }
    #[test]
    fn switch_fork_and_save_sync_real_files_index_and_user_identity() {
        let f = Fixture::new();
        f.perform(Action::CreateBranch { name: "old".into(), oid: f.first.clone() }).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest);
        f.perform(Action::SwitchBranch { name: "old".into() }).unwrap();
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "first\n"); assert!(!f.root.join("added.txt").exists()); assert!(f.root.join("deleted.txt").exists());
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
        f.perform(Action::ForkEdit { name: "if-safe".into(), oid: f.first.clone() }).unwrap();
        let saved = f.perform(f.save("changed\n")).unwrap();
        assert_ne!(saved["head"], f.first); assert_eq!(git(&f.root, &["show", "HEAD:中文.txt"]).unwrap(), "changed\n");
        assert_eq!(git(&f.root, &["log", "-1", "--format=%an <%ae>"]).unwrap().trim(), "Fixture Author <fixture@example.invalid>");
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
    }
    fn signing_fixture(f: &Fixture) -> String {
        let helper = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("tests/helpers/signing-fixture.cjs");
        let mut command = Command::new("node"); command.arg(helper).arg(&f.root).current_dir(&f.root);
        #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let output = command.output().expect("Node and OpenSSH ssh-keygen are required for signing verification");
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let data: Value = serde_json::from_slice(&output.stdout).unwrap();
        data["key"].as_str().unwrap().to_owned()
    }
    #[test]
    fn ssh_signing_edit_uses_configured_identity_and_verifiable_signature() {
        let f = Fixture::new(); let key = signing_fixture(&f);
        let result = f.perform(f.save("signed edit\n")).unwrap();
        git(&f.root, &["verify-commit", result["head"].as_str().unwrap()]).unwrap();
        assert!(git(&f.root, &["cat-file", "commit", "HEAD"]).unwrap().contains("gpgsig -----BEGIN SSH SIGNATURE-----"));
        assert_eq!(git(&f.root, &["log", "-1", "--format=%an <%ae>|%cn <%ce>"]).unwrap().trim(), "Fixture Author <fixture@example.invalid>|Fixture Author <fixture@example.invalid>");
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^"]).unwrap().trim(), f.latest);
        assert_eq!(git(&f.root, &["show", "HEAD:中文.txt"]).unwrap(), "signed edit\n");
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
        assert_eq!(journal::list(&f.root, None, 30).unwrap()["records"][0]["state"], "completed");
        fs::remove_file(key).unwrap();
    }
    #[test]
    fn ssh_signing_failure_retains_edit_and_reopened_operation_can_resume_signed() {
        let f = Fixture::new(); let key = signing_fixture(&f);
        git(&f.root, &["config", "user.signingkey", &format!("{key}.missing")]).unwrap();
        let error = f.perform(f.save("keep signed edit\n")).unwrap_err();
        assert!(error.contains("key") || error.contains("sign"), "{error}");
        let record = journal::list(&f.root, None, 30).unwrap()["records"][0].clone();
        assert_eq!(record["state"], "failed"); assert_eq!(head(&f.root).unwrap(), f.latest);
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "keep signed edit\n");
        assert_eq!(git(&f.root, &["write-tree"]).unwrap().trim(), record["checkpoint"]["tree"].as_str().unwrap());
        assert_eq!(git(&f.root, &["config", "--get", "commit.gpgsign"]).unwrap().trim(), "true");
        git(&f.root, &["config", "user.signingkey", &key]).unwrap();
        let id = record["id"].as_str().unwrap();
        // perform creates a new Operations instance, as a reopened app would.
        let result = f.perform(Action::ResumeCommit { id: id.into() }).unwrap();
        git(&f.root, &["verify-commit", result["head"].as_str().unwrap()]).unwrap();
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^"]).unwrap().trim(), f.latest);
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^{tree}"]).unwrap().trim(), record["checkpoint"]["tree"].as_str().unwrap());
        let completed = journal::read(&f.root, id).unwrap();
        assert_eq!(completed["state"], "completed"); assert_eq!(completed["attempts"], 2);
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
        fs::remove_file(key).unwrap();
    }
    #[test]
    fn preview_is_read_only_confirmation_is_single_use_and_repo_bound() {
        let f = Fixture::new(); let other = Fixture::new(); let mut ops = Operations::default();
        let plan = ops.prepare(&f.root, f.expected(), Action::ForkEdit { name: "test".into(), oid: f.first.clone() }).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest); assert!(git(&f.root, &["show-ref", "--verify", "refs/heads/test"]).is_err());
        let token = plan["token"].as_str().unwrap(); assert!(ops.execute(&other.root, token).unwrap_err().contains("仓库"));
        assert!(ops.execute(&f.root, token).unwrap_err().contains("失效"));
        let plan = ops.prepare(&f.root, f.expected(), f.save("new\n")).unwrap();
        let token = plan["token"].as_str().unwrap(); ops.execute(&f.root, token).unwrap();
        assert!(ops.execute(&f.root, token).unwrap_err().contains("失效"));
    }
    #[test]
    fn dirty_stale_expired_and_in_progress_states_do_not_write() {
        let f = Fixture::new(); let mut ops = Operations::default();
        let plan = ops.prepare(&f.root, f.expected(), f.save("new\n")).unwrap();
        fs::write(f.root.join("中文.txt"), "external edit\n").unwrap();
        assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("未提交"));
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "external edit\n");
        git(&f.root, &["restore", "--", "中文.txt"]).unwrap();
        let plan = ops.prepare(&f.root, f.expected(), f.save("new\n")).unwrap(); let token = plan["token"].as_str().unwrap();
        ops.plans.get_mut(token).unwrap().created = Instant::now() - Duration::from_secs(301);
        assert!(ops.execute(&f.root, token).unwrap_err().contains("过期"));
        let plan = ops.prepare(&f.root, f.expected(), f.save("new\n")).unwrap();
        git(&f.root, &["branch", "concurrent"]).unwrap();
        assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("历史已变化"));
        fs::write(f.root.join(".git/MERGE_HEAD"), &f.first).unwrap(); assert!(f.perform(f.save("new\n")).unwrap_err().contains("合并"));
        assert_eq!(head(&f.root).unwrap(), f.latest);
    }
    #[test]
    fn target_revision_changes_during_preview_or_confirmation_do_not_switch() {
        let f = Fixture::new(); let mut ops = Operations::default();
        git(&f.root, &["branch", "target", &f.first]).unwrap();
        let revision = super::super::history::snapshot(&f.root, 20).unwrap()["revision"].as_str().unwrap().to_owned();
        let action = Action::SwitchBranch { name: "target".into() };
        let plan = ops.prepare(&f.root, f.expected(), action.clone()).unwrap();
        assert_eq!(plan["target"], f.first);
        assert_eq!(plan["files"].as_array().unwrap().len(), 3);
        git(&f.root, &["update-ref", "refs/heads/target", &f.latest, &f.first]).unwrap();
        // Deterministically enter the validation phase with the revision captured
        // before an external target update, as prepare() does before reading files.
        assert!(preview_at_revision(&f.root, &f.expected(), &action, &revision).unwrap_err().contains("历史已变化"));
        assert!(ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap_err().contains("历史已变化"));
        assert_eq!(branch(&f.root), "main"); assert_eq!(head(&f.root).unwrap(), f.latest);
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "second\n");
        assert!(git(&f.root, &["status", "--porcelain"]).unwrap().is_empty());
        assert!(!f.root.join(".git/gitviz/operations").exists());
    }
    #[test]
    fn bounded_git_timeout_stops_real_hook_children_and_keeps_staged_files() {
        let f = Fixture::new();
        let helper = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("tests/helpers/slow-git-hook.cjs");
        let quoted = helper.to_string_lossy().replace('\\', "/").replace('\'', "'\\''");
        fs::write(f.root.join(".git/hooks/pre-commit"), format!("#!/bin/sh\nexec node '{quoted}' parent\n")).unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(f.root.join(".git/hooks/pre-commit"),fs::Permissions::from_mode(0o755)).unwrap(); }
        fs::write(f.root.join("中文.txt"), "timeout edit\n").unwrap();
        git(&f.root, &["add", "--", "中文.txt"]).unwrap();
        let failure = super::super::git_process::run(&f.root, &["commit", "-m", "slow hook"], Duration::from_secs(5), 1024 * 1024, None).unwrap_err();
        assert!(!failure.uncertain, "{}", failure.message); assert!(failure.message.contains("超过 5 秒"));
        for name in ["parent", "child"] {
            let pid = fs::read_to_string(f.root.join(format!(".git/process-{name}.pid"))).unwrap();
            let mut check = Command::new("node");
            check.args(["-e", "try { process.kill(Number(process.argv[1]),0); process.exit(1) } catch(e) { process.exit(e.code === 'ESRCH' ? 0 : 2) }", pid.trim()]);
            #[cfg(windows)] { use std::os::windows::process::CommandExt; check.creation_flags(0x08000000); }
            assert!(check.status().unwrap().success(), "hook {name} survived timeout");
            let file = f.root.join(format!(".git/process-{name}.heartbeat")); let before = fs::read(&file).unwrap();
            std::thread::sleep(Duration::from_millis(300)); assert_eq!(fs::read(&file).unwrap(), before);
        }
        assert_eq!(head(&f.root).unwrap(), f.latest);
        assert_eq!(git(&f.root, &["show", ":中文.txt"]).unwrap(), "timeout edit\n");
        fs::remove_file(f.root.join(".git/hooks/pre-commit")).unwrap();
        git(&f.root, &["commit", "-m", "after timeout"]).unwrap();
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^"]).unwrap().trim(), f.latest);
    }
    #[test]
    fn git_output_limit_rejects_partial_history_instead_of_returning_success() {
        let f = Fixture::new();
        let failure = super::super::git_process::run(&f.root, &["log", "-1", "--format=%H"], Duration::from_secs(5), 4, None).unwrap_err();
        assert!(!failure.uncertain, "{}", failure.message);
        assert!(failure.message.contains("超过大小限制"));
        assert_eq!(head(&f.root).unwrap(), f.latest);
    }
    #[test]
    fn uncertain_git_process_preserves_lock_and_blocks_another_write() {
        let f = Fixture::new();
        let lock = lock_repo(&f.root).unwrap();
        let message = super::super::git_process::describe(&f.root, super::super::git_process::ProcessError { message: "injected cleanup failure".into(), uncertain: true });
        assert!(message.contains("无法确认")); drop(lock);
        assert!(f.root.join(".git/gitviz-operation.lock").exists());
        assert!(lock_repo(&f.root).is_err());
        assert_eq!(head(&f.root).unwrap(), f.latest);
    }
    #[cfg(windows)]
    #[test]
    fn exited_git_parent_with_open_pipe_returns_bounded_uncertainty() {
        use std::os::windows::process::CommandExt;
        let f = Fixture::new();
        let helper = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("tests/helpers/slow-git-hook.cjs");
        let quoted = helper.to_string_lossy().replace('\\', "/").replace('\'', "'\\''");
        let alias = format!("alias.hold=!node '{quoted}' pipe-child &");
        let started = Instant::now();
        let result = super::super::git_process::run(&f.root, &["-c", &alias, "hold"], Duration::from_millis(1500), 1024 * 1024, None);
        let elapsed = started.elapsed();
        // Clean up the exact fixture child before assertions, including on failure.
        let pid = fs::read_to_string(f.root.join(".git/process-pipe-child.pid")).unwrap();
        let system = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(||PathBuf::from("C:/Windows"));
        let cleanup = Command::new(system.join("System32/taskkill.exe")).args(["/PID", pid.trim(), "/T", "/F"])
            .creation_flags(0x08000000).output().unwrap();
        assert!(cleanup.status.success(), "fixture child should still be alive until explicitly cleaned up");
        let failure = result.unwrap_err();
        assert!(failure.uncertain, "{}", failure.message);
        assert!(elapsed < Duration::from_secs(10), "pipe drainage must be bounded: {elapsed:?}");
    }
    #[test]
    fn unsafe_paths_and_git_metadata_are_rejected_and_hardlink_target_is_untouched() {
        let f = Fixture::new();
        for path in ["../outside.txt", "/absolute", "C:/outside", "中文.txt:stream", ".git/config", "./中文.txt", "a/../中文.txt", "NUL", "中文.txt.", "x\\y"] { assert!(edit_path(&f.root, path).is_err(), "{path}"); }
        let outside = f.root.with_extension("outside"); fs::hard_link(f.root.join("中文.txt"), &outside).unwrap();
        f.perform(f.save("independent\n")).unwrap(); assert_eq!(fs::read_to_string(outside).unwrap(), "second\n");
        assert!(f.perform(Action::CreateBranch { name: "@{-1}".into(), oid: f.first.clone() }).is_err());
    }
    #[test]
    fn linked_edit_paths_are_rejected_without_touching_the_external_target() {
        let f = Fixture::new();
        let tracked = f.root.join("tracked-directory");
        fs::create_dir(&tracked).unwrap(); fs::write(tracked.join("file.txt"), "outside content\n").unwrap();
        git(&f.root, &["add", "--", "tracked-directory/file.txt"]).unwrap();
        git(&f.root, &["commit", "-m", "tracked directory"]).unwrap();
        let before_head = head(&f.root).unwrap(); let index = fs::read(f.root.join(".git/index")).unwrap();
        let outside = f.root.with_extension("link-target");
        assert!(outside.is_absolute() && outside.starts_with(f.root.parent().unwrap()) && !outside.starts_with(&f.root));
        assert!(!outside.exists());
        fs::rename(&tracked, &outside).unwrap();
        // A junction needs no Windows symlink privilege; Unix uses a real symlink.
        let mut command = Command::new("node");
        command.args(["-e", "require('node:fs').symlinkSync(process.argv[1],process.argv[2],process.platform==='win32'?'junction':'dir')"])
            .arg(&outside).arg(&tracked);
        #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let output = command.output().unwrap(); assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let path_error = edit_path(&f.root, "tracked-directory/file.txt").unwrap_err();
        assert!(path_error.contains("链接") || path_error.contains("重解析"), "{path_error}");
        let action = Action::SaveEdit { path: "tracked-directory/file.txt".into(), content: "must not write\n".into(), message: "blocked linked edit".into() };
        let error = f.perform(action).unwrap_err();
        // Git also reports a replaced directory as dirty on Unix; either guard
        // must reject the operation, while edit_path above proves link detection.
        assert!(error.contains("链接") || error.contains("重解析") || error.contains("未提交"), "{error}");
        assert_eq!(head(&f.root).unwrap(), before_head);
        assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
        assert_eq!(fs::read_to_string(outside.join("file.txt")).unwrap(), "outside content\n");
        assert!(journal::list(&f.root, None, 30).unwrap()["records"].as_array().unwrap().is_empty());
        #[cfg(unix)] {
            let file = f.root.join("中文.txt"); let external = outside.join("direct-file.txt");
            fs::rename(&file, &external).unwrap(); std::os::unix::fs::symlink(&external, &file).unwrap();
            assert!(edit_path(&f.root, "中文.txt").unwrap_err().contains("链接"));
            assert_eq!(fs::read_to_string(&external).unwrap(), "second\n");
        }
    }
    #[test]
    fn restore_retains_history_and_worktree_creation_leaves_original_untouched() {
        let f = Fixture::new();
        let result = f.perform(Action::CreateWorktree { name: "trial".into(), oid: f.first.clone(), directory: f.root.parent().unwrap().join("worktrees").to_string_lossy().into_owned() }).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(fs::read_to_string(Path::new(result["worktree"].as_str().unwrap()).join("中文.txt")).unwrap(), "first\n");
        let restored = f.perform(Action::Restore { oid: f.first.clone() }).unwrap();
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^"]).unwrap().trim(), f.latest);
        assert_eq!(git(&f.root, &["rev-parse", "HEAD^{tree}"]).unwrap(), git(&f.root, &["rev-parse", &format!("{}^{{tree}}", f.first)]).unwrap());
        assert_eq!(git(&f.root, &["rev-parse", restored["backup"].as_str().unwrap()]).unwrap().trim(), f.latest);
    }
    #[test]
    fn branch_and_worktree_previews_name_the_target_and_preserve_dirty_original() {
        let f = Fixture::new(); let mut ops = Operations::default();
        fs::write(f.root.join("中文.txt"), "unsaved original\n").unwrap();
        let directory = f.root.parent().unwrap().join("试验 空格").to_string_lossy().into_owned();
        let plan = ops.prepare(&f.root, f.expected(), Action::CreateWorktree { name: "trial-ui".into(), oid: f.first.clone(), directory: directory.clone() }).unwrap();
        assert_eq!(plan["target"], f.first); assert_eq!(plan["branchName"], "trial-ui"); assert_eq!(plan["directory"], directory);
        assert_eq!(plan["confirmLabel"], "确认创建工作区");
        assert!(plan["filesLabel"].as_str().unwrap().contains("原目录不变"));
        assert!(git(&f.root, &["show-ref", "--verify", "refs/heads/trial-ui"]).is_err());
        let result = ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(branch(&f.root), "main");
        assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "unsaved original\n");
        assert_eq!(fs::read_to_string(Path::new(result["worktree"].as_str().unwrap()).join("中文.txt")).unwrap(), "first\n");
        let plan = ops.prepare(&f.root, f.expected(), Action::CreateBranch { name: "named-branch".into(), oid: f.first.clone() }).unwrap();
        assert_eq!(plan["branchName"], "named-branch"); assert_eq!(plan["confirmLabel"], "确认创建分支");
        ops.execute(&f.root, plan["token"].as_str().unwrap()).unwrap();
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "unsaved original\n");
    }
    #[test]
    fn hook_failure_retains_editor_content_and_original_head() {
        let f = Fixture::new(); let hook = f.root.join(".git/hooks/pre-commit"); fs::write(&hook, "#!/bin/sh\necho fixture-hook-rejected >&2\nexit 1\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap(); }
        let error = f.perform(f.save("keep my edit\n")).unwrap_err(); assert!(error.contains("fixture-hook-rejected")); assert!(error.contains("保留"));
        assert_eq!(head(&f.root).unwrap(), f.latest); assert_eq!(fs::read_to_string(f.root.join("中文.txt")).unwrap(), "keep my edit\n");
        assert_eq!(git(&f.root, &["show", ":中文.txt"]).unwrap(), "keep my edit\n");
    }
    fn failing_hook(f: &Fixture) -> PathBuf {
        let hook = f.root.join(".git/hooks/pre-commit"); fs::write(&hook,"#!/bin/sh\necho fixture-hook-rejected >&2\nexit 1\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&hook,fs::Permissions::from_mode(0o755)).unwrap(); }
        hook
    }
    fn node_fixture(mode: &str, f: &Fixture, value: &str) -> String {
        let helper = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("tests/helpers/recovery-interop.cjs");
        let mut command = Command::new("node"); command.arg(helper).args([mode,f.root.to_str().unwrap(),value]).current_dir(&f.root);
        #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let output = command.output().expect("Node is required for the cross-host recovery contract tests");
        assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr)); String::from_utf8(output.stdout).unwrap().trim().into()
    }
    #[test]
    fn node_can_resume_rust_edit_record_without_storing_editor_text() {
        let f = Fixture::new(); let hook = failing_hook(&f);
        assert!(f.perform(f.save("keep this editor text\n")).is_err());
        let record = journal::list(&f.root,None,30).unwrap()["records"][0].clone();
        assert_eq!(record["state"],"failed"); assert!(record["params"]["content"].is_null());
        assert!(!serde_json::to_string(&record).unwrap().contains("keep this editor text"));
        let id = record["id"].as_str().unwrap();
        fs::remove_file(hook).unwrap();
        let result: Value = serde_json::from_str(&node_fixture("resume",&f,id)).unwrap();
        assert_eq!(result["operationId"],id);
        assert_eq!(git(&f.root,&["rev-parse","HEAD^"]).unwrap().trim(),f.latest);
        assert_eq!(git(&f.root,&["show","HEAD:中文.txt"]).unwrap(),"keep this editor text\n");
        assert_eq!(journal::read(&f.root,id).unwrap()["state"],"completed");
        assert!(f.perform(Action::ResumeCommit {id:id.into()}).unwrap_err().contains("没有可继续"));
    }
    #[test]
    fn rust_can_resume_node_restore_but_rejects_changed_files_index_head_and_preview() {
        let f = Fixture::new(); let hook = failing_hook(&f);
        let id = node_fixture("fail",&f,&f.first); let record = journal::read(&f.root,&id).unwrap();
        let action = || Action::ResumeCommit {id:id.clone()};
        let mut ops = Operations::default();
        let index = fs::read(f.root.join(".git/index")).unwrap();
        let preview = ops.prepare(&f.root,f.expected(),action()).unwrap();
        assert_eq!(fs::read(f.root.join(".git/index")).unwrap(),index); assert_eq!(journal::read(&f.root,&id).unwrap()["attempts"],1);
        fs::write(f.root.join("中文.txt"),"external edit\n").unwrap();
        assert!(ops.execute(&f.root,preview["token"].as_str().unwrap()).unwrap_err().contains("工作文件"));
        git(&f.root,&["add","--","中文.txt"]).unwrap();
        assert!(f.perform(action()).unwrap_err().contains("暂存区"));
        git(&f.root,&["restore",&format!("--source={}",f.first),"--staged","--worktree","--","."]).unwrap();
        fs::write(f.root.join("untracked.txt"),"keep").unwrap(); assert!(f.perform(action()).unwrap_err().contains("未跟踪")); fs::remove_file(f.root.join("untracked.txt")).unwrap();
        git(&f.root,&["update-ref","refs/heads/main",&f.first]).unwrap(); assert!(f.perform(action()).unwrap_err().contains("起点不同"));
        git(&f.root,&["update-ref","refs/heads/main",&f.latest]).unwrap();
        let preview = ops.prepare(&f.root,f.expected(),action()).unwrap();
        let mut changed = record.clone(); changed["checkpoint"]["message"] = json!("different confirmed message"); journal::save(&f.root,&changed).unwrap();
        assert!(ops.execute(&f.root,preview["token"].as_str().unwrap()).unwrap_err().contains("检查点已变化"));
        journal::save(&f.root,&record).unwrap(); fs::remove_file(hook).unwrap();
        let result = f.perform(action()).unwrap(); assert_eq!(result["operationId"],id);
        assert_eq!(git(&f.root,&["rev-parse","HEAD^"]).unwrap().trim(),f.latest);
        assert_eq!(git(&f.root,&["rev-parse","HEAD^{tree}"]).unwrap().trim(),record["checkpoint"]["tree"].as_str().unwrap());
        assert_eq!(git(&f.root,&["rev-parse",record["backup"].as_str().unwrap()]).unwrap().trim(),f.latest);
        let listed: Value = serde_json::from_str(&node_fixture("list",&f,"")).unwrap(); assert_eq!(listed["records"][0]["state"],"completed");
    }
}

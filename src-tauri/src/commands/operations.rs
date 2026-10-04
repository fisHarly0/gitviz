//! Desktop write transactions. Every action is previewed, bound to a repository
//! snapshot, confirmed once, and executed through Git (including user hooks).
use crate::SharedRepoState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, fs, io::{Read, Write}, path::{Component, Path, PathBuf}, process::{Command, Stdio}, sync::{Arc, Mutex}, time::{Duration, Instant}};
use tauri::State;

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
}

struct Plan { root: PathBuf, expected: Expected, action: Action, revision: String, created: Instant }
#[derive(Default)]
pub struct Operations { plans: HashMap<String, Plan> }
pub type SharedOperations = Arc<Mutex<Operations>>;

fn nonce() -> Result<String, String> {
    let mut bytes = [0u8; 16]; getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn command(root: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(root).args(["--no-optional-locks", "-c", "core.quotepath=false"])
        .env("GIT_TERMINAL_PROMPT", "0").env("GIT_LITERAL_PATHSPECS", "1");
    #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    cmd
}

pub(crate) fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut child = command(root).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("无法运行 Git：{e}"))?;
    // Drain both streams, retaining bounded diagnostic output. Hooks can be noisy.
    fn drain(mut stream: impl Read) -> Vec<u8> {
        let mut out = Vec::new(); let mut buf = [0u8; 8192];
        while let Ok(n) = stream.read(&mut buf) { if n == 0 { break; } let keep = n.min((8 * 1024 * 1024usize).saturating_sub(out.len())); out.extend_from_slice(&buf[..keep]); }
        out
    }
    let stdout = child.stdout.take().unwrap(); let stderr = child.stderr.take().unwrap();
    let output = std::thread::spawn(move || drain(stdout)); let errors = std::thread::spawn(move || drain(stderr));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e|e.to_string())? { break status; }
        if started.elapsed() > Duration::from_secs(120) {
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).creation_flags(0x08000000).output();
            }
            let _ = child.kill(); let _ = child.wait();
            return Err("Git 操作超过 120 秒。请检查 Git 状态；已经产生的更改会保留。".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let out = output.join().unwrap_or_default(); let err = errors.join().unwrap_or_default();
    if !status.success() { return Err(String::from_utf8_lossy(&err).trim().to_owned()); }
    Ok(String::from_utf8_lossy(&out).into_owned())
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
    if clean && !git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?.is_empty() { return Err("工作区有未提交或未跟踪文件，请先提交或暂存到 stash。".into()); }
    for marker in ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"] {
        let file = git(root, &["rev-parse", "--git-path", marker])?;
        if root.join(file.trim()).exists() { return Err("仓库正在合并、变基或挑选提交，请先完成或中止。".into()); }
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
    if git(root, &["config", "--bool", "core.sparseCheckout"]).unwrap_or_default().trim() == "true" { return Err("稀疏检出仓库暂不支持此写操作。".into()); }
    Ok(())
}

fn validate(root: &Path, expected: &Expected, action: &Action) -> Result<Value, String> {
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
    }
    let files = if let Some(id) = &target { git(root, &["diff", "--name-only", "-z", &expected.head, id, "--"])? .split('\0').filter(|s|!s.is_empty()).map(str::to_owned).collect::<Vec<_>>() } else if let Action::SaveEdit { path, .. } = action { vec![path.clone()] } else { vec![] };
    let impact = match action {
        Action::SwitchBranch { .. } => "切换真实分支，并同步暂存区与工作文件。",
        Action::ForkEdit { .. } => "创建试验分支，并把当前工作目录切换到选中的存档。",
        Action::SaveEdit { .. } => "写入当前编辑文件并创建提交。Git 身份、签名和钩子仍生效。",
        Action::Restore { .. } => "先建立备份分支，再恢复文件并创建新提交，后续历史保留。",
        Action::CreateBranch { .. } => "增加分支引用，当前工作文件保持不变。",
        Action::CreateWorktree { .. } => "新建独立工作目录，原工作目录保持不变。",
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

struct OperationLock(PathBuf);
impl Drop for OperationLock { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }
fn lock_repo(root: &Path) -> Result<OperationLock, String> {
    let path = root.join(git(root, &["rev-parse", "--git-path", "gitviz-operation.lock"])?.trim());
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| "另一个 Gitviz 写操作正在进行。如果上次异常退出，请检查 Git 状态后删除 .git/gitviz-operation.lock。".to_owned())?;
    write!(file, "{}", std::process::id()).map_err(|e|e.to_string())?; Ok(OperationLock(path))
}

fn execute_action(root: &Path, expected: &Expected, action: &Action) -> Result<Value, String> {
    let _lock = lock_repo(root)?; validate(root, expected, action)?;
    let mut result = json!({});
    match action {
        Action::SwitchBranch { name } => { git(root, &["switch", "--no-guess", "--no-overwrite-ignore", "--", name])?; }
        Action::CreateBranch { name, oid } => { git(root, &["branch", "--", name, oid])?; }
        Action::ForkEdit { name, oid } => { git(root, &["switch", "--no-overwrite-ignore", "-c", name, oid])?; }
        Action::CreateWorktree { name, oid, directory } => {
            fs::create_dir_all(directory).map_err(|e|e.to_string())?;
            let folder = Path::new(directory).join(format!("gitviz-{}-{}", &oid[..7], &nonce()?[..8]));
            git(root, &["worktree", "add", "-b", name, "--", &folder.to_string_lossy(), oid])?;
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
                git(root, &["commit", "--only", "-m", message, "--", path])?;
                Ok(())
            })();
            if let Err(error) = saved { return Err(format!("提交未完成：{error}\n编辑内容已保留在工作文件或暂存区，未自动丢弃。请检查 Git 状态，解决身份、钩子或签名问题后继续提交。")); }
        }
        Action::Restore { oid } => {
            let backup = format!("gitviz/backup-{}", nonce()?);
            git(root, &["branch", "--", &backup, &expected.head])?;
            let restored = (|| -> Result<(), String> {
                guard(root, expected, true)?;
                git(root, &["restore", &format!("--source={oid}"), "--staged", "--worktree", "--", "."])?;
                git(root, &["commit", "-m", &format!("Restore snapshot {}\n\nPrevious HEAD preserved on {backup}.", &oid[..7])])?;
                if git(root, &["rev-parse", "HEAD^{tree}"])? != git(root, &["rev-parse", &format!("{oid}^{{tree}}")])? { return Err("提交钩子修改了结果，请检查差异。".into()); }
                Ok(())
            })();
            if let Err(error) = restored { return Err(format!("恢复未完成：{error}\n恢复前版本在 {backup}；已产生的文件和暂存更改保留，请检查 Git 状态。")); }
            result["backup"] = json!(backup);
        }
    }
    result["head"] = json!(head(root)?); result["branch"] = json!(branch(root));
    result["repo"] = json!(root.to_string_lossy()); result["message"] = json!("操作完成，实际 Git 状态已更新。");
    Ok(result)
}

impl Operations {
    pub fn prepare(&mut self, root: &Path, expected: Expected, action: Action) -> Result<Value, String> {
        self.plans.retain(|_,p|p.created.elapsed() < Duration::from_secs(300));
        if self.plans.len() >= 32 { return Err("待确认操作过多，请稍后重试。".into()); }
        let mut preview = validate(root, &expected, &action)?;
        let revision = super::history::snapshot(root, 20)?["revision"].as_str().unwrap().to_owned();
        let token = nonce()?;
        self.plans.insert(token.clone(), Plan { root: canonical(root)?, expected, action, revision, created: Instant::now() });
        preview["token"] = json!(token); Ok(preview)
    }
    pub fn execute(&mut self, root: &Path, token: &str) -> Result<Value, String> {
        let plan = self.plans.remove(token).ok_or("确认已使用或失效，请重新预览。")?;
        if plan.created.elapsed() >= Duration::from_secs(300) { return Err("确认已过期，请重新预览。".into()); }
        if canonical(root)? != plan.root { return Err("仓库已变化，不能执行旧操作。".into()); }
        if super::history::snapshot(root, 20)?["revision"] != plan.revision { return Err("历史已变化，请重新预览操作。".into()); }
        execute_action(root, &plan.expected, &plan.action)
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
    fn unsafe_paths_and_git_metadata_are_rejected_and_hardlink_target_is_untouched() {
        let f = Fixture::new();
        for path in ["../outside.txt", "/absolute", "C:/outside", "中文.txt:stream", ".git/config", "./中文.txt", "a/../中文.txt", "NUL", "中文.txt.", "x\\y"] { assert!(edit_path(&f.root, path).is_err(), "{path}"); }
        let outside = f.root.with_extension("outside"); fs::hard_link(f.root.join("中文.txt"), &outside).unwrap();
        f.perform(f.save("independent\n")).unwrap(); assert_eq!(fs::read_to_string(outside).unwrap(), "second\n");
        assert!(f.perform(Action::CreateBranch { name: "@{-1}".into(), oid: f.first.clone() }).is_err());
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
}

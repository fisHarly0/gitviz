use crate::SharedRepoState;
use tauri::State;

use super::current_repo_path;
use super::open_repo_at;
use super::repo::parse_oid;

#[tauri::command]
pub async fn create_branch(
    state: State<'_, SharedRepoState>,
    name: String,
    from_oid: String,
) -> Result<(), String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    let oid = parse_oid(&from_oid)?;
    let ref_name = format!("refs/heads/{name}");

    repo.reference(
        ref_name.as_str(),
        oid,
        gix::refs::transaction::PreviousValue::MustNotExist,
        format!("gitviz: create if-line branch from {from_oid}"),
    )
    .map_err(|e| format!("create_branch ({name}): {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn checkout(
    state: State<'_, SharedRepoState>,
    branch: String,
) -> Result<(), String> {
    let repo_path = current_repo_path(&state)?;
    let repo = open_repo_at(&repo_path)?;
    let ref_name = format!("refs/heads/{branch}");

    // verify branch exists
    let _ = repo
        .find_reference(ref_name.as_str())
        .map_err(|e| format!("find_reference {ref_name}: {e}"))?;

    // 仅更新 HEAD symbolic 指向新 branch · working tree 不动（游戏存档哲学）
    let head_full: gix::refs::FullName = "HEAD"
        .try_into()
        .map_err(|e| format!("HEAD parse: {e}"))?;
    let target_full: gix::refs::FullName = ref_name
        .as_str()
        .try_into()
        .map_err(|e| format!("target ref parse: {e}"))?;

    let edit = gix::refs::transaction::RefEdit {
        change: gix::refs::transaction::Change::Update {
            log: gix::refs::transaction::LogChange {
                mode: gix::refs::transaction::RefLog::AndReference,
                force_create_reflog: false,
                message: format!("gitviz: checkout {branch}").into(),
            },
            expected: gix::refs::transaction::PreviousValue::Any,
            new: gix::refs::Target::Symbolic(target_full),
        },
        name: head_full,
        deref: false,
    };

    repo.edit_reference(edit)
        .map_err(|e| format!("edit HEAD for checkout {branch}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn current_branch(state: State<'_, SharedRepoState>) -> Result<Option<String>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(None),
    };
    Ok(head.referent_name().map(|r| r.shorten().to_string()))
}

#[tauri::command]
pub async fn head_oid(state: State<'_, SharedRepoState>) -> Result<Option<String>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    Ok(repo.head_id().ok().map(|id| id.to_hex().to_string()))
}

#[tauri::command]
pub async fn write_file(
    state: State<'_, SharedRepoState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let repo_path = current_repo_path(&state)?;
    let repo = open_repo_at(&repo_path)?;
    let work_dir = repo
        .workdir()
        .ok_or_else(|| "repo is bare (no work dir)".to_string())?;
    let full_path = work_dir.join(&path);
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dirs {parent:?}: {e}"))?;
    }
    std::fs::write(&full_path, content.as_bytes())
        .map_err(|e| format!("write_file {full_path:?}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn add_and_commit(
    state: State<'_, SharedRepoState>,
    path: String,
    message: String,
    author_name: String,
    author_email: String,
) -> Result<String, String> {
    let repo_path = current_repo_path(&state)?;
    let repo = open_repo_at(&repo_path)?;

    // 1. 读 work_dir/path 的内容
    let work_dir = repo
        .workdir()
        .ok_or_else(|| "repo is bare (no work dir)".to_string())?;
    let full_path = work_dir.join(&path);
    let content =
        std::fs::read(&full_path).map_err(|e| format!("read {full_path:?}: {e}"))?;

    // 2. 写 blob object
    let blob_id = repo
        .write_blob(content.as_slice())
        .map_err(|e| format!("write_blob: {e}"))?;

    // 3. 拿当前 HEAD commit + 它的 tree 作为 base
    let head_id = repo.head_id().map_err(|e| format!("head_id: {e}"))?;
    let head_commit = repo
        .find_commit(head_id)
        .map_err(|e| format!("find_commit HEAD: {e}"))?;
    let base_tree_id = head_commit
        .tree_id()
        .map_err(|e| format!("tree_id: {e}"))?
        .detach();

    // 4. 用 tree editor 替换 path 处的 blob, 输出新 tree id
    let new_tree_id = edit_tree_blob(&repo, base_tree_id, &path, blob_id.into())?;

    // 5. 拿当前 HEAD branch ref（commit_as 要写入这个 ref）
    let head_ref_name = repo
        .head_name()
        .map_err(|e| format!("head_name: {e}"))?
        .ok_or_else(|| "HEAD is detached".to_string())?;

    // 6. 构造 signature · author + committer 同一身份
    let now = std::time::SystemTime::now();
    let secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let time = gix::date::Time::new(secs, 0);
    let signature = gix::actor::Signature {
        name: author_name.into(),
        email: author_email.into(),
        time,
    };

    // 7. commit_as 创建 commit object + 更新 HEAD ref 指向新 commit
    // SignatureRef 是 borrowed view，每个 ref 需要独立的 TimeBuf
    let mut time_buf_c = gix::date::parse::TimeBuf::default();
    let mut time_buf_a = gix::date::parse::TimeBuf::default();
    let committer_ref = signature.to_ref(&mut time_buf_c);
    let author_ref = signature.to_ref(&mut time_buf_a);

    let new_commit_id = repo
        .commit_as(
            committer_ref,
            author_ref,
            head_ref_name.as_bstr(),
            message,
            new_tree_id,
            std::iter::once(head_id.detach()),
        )
        .map_err(|e| format!("commit_as: {e}"))?;

    Ok(new_commit_id.detach().to_hex().to_string())
}

/// 在 base_tree 上 upsert 一个 path → blob_id, 返回新 tree id
fn edit_tree_blob(
    repo: &gix::Repository,
    base_tree_id: gix::ObjectId,
    path: &str,
    blob_id: gix::ObjectId,
) -> Result<gix::ObjectId, String> {
    let mut editor = repo
        .edit_tree(base_tree_id)
        .map_err(|e| format!("edit_tree {base_tree_id}: {e}"))?;
    if path.trim_matches('/').is_empty() {
        return Err(format!("empty path: {path}"));
    }
    editor
        .upsert(path, gix::object::tree::EntryKind::Blob, blob_id)
        .map_err(|e| format!("tree upsert {path}: {e}"))?;
    let new_id = editor
        .write()
        .map_err(|e| format!("tree write: {e}"))?;
    Ok(new_id.detach())
}

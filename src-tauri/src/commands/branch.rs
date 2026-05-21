use crate::SharedRepoState;
use tauri::State;

use super::current_repo_path;
use super::open_repo_at;

#[tauri::command]
pub async fn create_branch(
    state: State<'_, SharedRepoState>,
    name: String,
    from_oid: String,
) -> Result<(), String> {
    let _ = (state, name, from_oid);
    Err("create_branch: not yet implemented in Tauri-1 (coming in P-Tauri-1.2)".into())
}

#[tauri::command]
pub async fn checkout(
    state: State<'_, SharedRepoState>,
    branch: String,
) -> Result<(), String> {
    let _ = (state, branch);
    Err("checkout: not yet implemented in Tauri-1 (coming in P-Tauri-1.2)".into())
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
    let _ = (state, path, content);
    Err("write_file: not yet implemented in Tauri-1 (coming in P-Tauri-1.2)".into())
}

#[tauri::command]
pub async fn add_and_commit(
    state: State<'_, SharedRepoState>,
    path: String,
    message: String,
    author_name: String,
    author_email: String,
) -> Result<String, String> {
    let _ = (state, path, message, author_name, author_email);
    Err("add_and_commit: not yet implemented in Tauri-1 (coming in P-Tauri-1.2)".into())
}

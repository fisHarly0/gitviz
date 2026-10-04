use crate::SharedRepoState;
use tauri::State;
use super::{current_repo_path, open_repo_at};

#[tauri::command]
pub async fn current_branch(state: State<'_, SharedRepoState>) -> Result<Option<String>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    let head = match repo.head() { Ok(h) => h, Err(_) => return Ok(None) };
    Ok(head.referent_name().map(|r| r.shorten().to_string()))
}

#[tauri::command]
pub async fn head_oid(state: State<'_, SharedRepoState>) -> Result<Option<String>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    Ok(repo.head_id().ok().map(|id| id.to_hex().to_string()))
}

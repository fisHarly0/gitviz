pub mod branch;
pub mod export;
pub mod repo;

use crate::SharedRepoState;
use std::path::PathBuf;

pub(crate) fn current_repo_path(
    state: &tauri::State<'_, SharedRepoState>,
) -> Result<PathBuf, String> {
    let guard = state.lock().map_err(|e| format!("state lock poisoned: {e}"))?;
    match guard.as_ref() {
        Some(s) => Ok(s.repo_path.clone()),
        None => Err("no repo opened yet — call open_repo first".into()),
    }
}

pub(crate) fn open_repo_at(path: &std::path::Path) -> Result<gix::Repository, String> {
    gix::open(path).map_err(|e| format!("gix::open({}) failed: {e}", path.display()))
}

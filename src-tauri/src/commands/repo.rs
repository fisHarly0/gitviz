use crate::{RepoState, SharedRepoState};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

use super::{current_repo_path, open_repo_at};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub branches: Vec<RefInfo>,
    pub head_oid: Option<String>,
    pub current_branch: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct RefInfo {
    pub name: String,
    pub oid: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub oid: String,
    pub parents: Vec<String>,
    pub message: String,
    pub full_message: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub commit: CommitInfo,
    pub files: Vec<FileChange>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub old_text: String,
    pub new_text: String,
}

#[tauri::command]
pub async fn open_repo(
    state: State<'_, SharedRepoState>,
    path: String,
) -> Result<RepoInfo, String> {
    let p = PathBuf::from(&path);
    let repo = open_repo_at(&p)?;
    {
        let mut guard = state.lock().map_err(|e| format!("state lock: {e}"))?;
        *guard = Some(RepoState { repo_path: p.clone() });
    }
    let branches = list_branches_inner(&repo)?;
    let head_oid = head_oid_inner(&repo);
    let current_branch = current_branch_inner(&repo);
    Ok(RepoInfo {
        path,
        branches,
        head_oid,
        current_branch,
    })
}

#[tauri::command]
pub async fn list_branches(state: State<'_, SharedRepoState>) -> Result<Vec<RefInfo>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    list_branches_inner(&repo)
}

#[tauri::command]
pub async fn list_commits(
    state: State<'_, SharedRepoState>,
    branch: Option<String>,
    depth: Option<u32>,
) -> Result<Vec<CommitInfo>, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    let depth = depth.unwrap_or(200) as usize;

    let start_id: gix::ObjectId = if let Some(b) = branch {
        let full = format!("refs/heads/{b}");
        let r = repo
            .find_reference(full.as_str())
            .map_err(|e| format!("find_reference {b}: {e}"))?;
        match r.target() {
            gix::refs::TargetRef::Object(id) => id.to_owned(),
            gix::refs::TargetRef::Symbolic(_) => {
                return Err(format!("symbolic ref not supported here: {b}"))
            }
        }
    } else {
        repo.head_id()
            .map_err(|e| format!("head_id: {e}"))?
            .detach()
    };

    let walk = repo
        .rev_walk([start_id])
        .all()
        .map_err(|e| format!("rev_walk: {e}"))?;
    let mut out: Vec<CommitInfo> = Vec::new();
    for info in walk.take(depth) {
        let info = info.map_err(|e| format!("walk iter: {e}"))?;
        let id = info.id;
        let commit = repo
            .find_commit(id)
            .map_err(|e| format!("find_commit: {e}"))?;
        out.push(commit_to_info(&commit)?);
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_commit_detail(
    state: State<'_, SharedRepoState>,
    oid: String,
) -> Result<CommitDetail, String> {
    let path = current_repo_path(&state)?;
    let repo = open_repo_at(&path)?;
    let id = parse_oid(&oid)?;
    let commit = repo
        .find_commit(id)
        .map_err(|e| format!("find_commit: {e}"))?;
    let info = commit_to_info(&commit)?;
    // 文件 diff 在 P-Tauri-1 第二轮迭代时补 · 当前先返空数组让前端能渲染 commit 头部信息
    let files: Vec<FileChange> = vec![];
    Ok(CommitDetail {
        commit: info,
        files,
    })
}

#[tauri::command]
pub async fn read_file_at(
    state: State<'_, SharedRepoState>,
    path: String,
    oid: String,
) -> Result<String, String> {
    let repo_path = current_repo_path(&state)?;
    let repo = open_repo_at(&repo_path)?;
    let id = parse_oid(&oid)?;
    let commit = repo
        .find_commit(id)
        .map_err(|e| format!("find_commit: {e}"))?;
    let tree_id = commit
        .tree_id()
        .map_err(|e| format!("tree_id: {e}"))?
        .detach();
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("find_tree: {e}"))?;
    let blob_id = lookup_path_in_tree(&repo, &tree, &path)?;
    let blob = repo
        .find_blob(blob_id)
        .map_err(|e| format!("find_blob: {e}"))?;
    Ok(String::from_utf8_lossy(&blob.data).to_string())
}

fn list_branches_inner(repo: &gix::Repository) -> Result<Vec<RefInfo>, String> {
    let refs = repo
        .references()
        .map_err(|e| format!("references: {e}"))?;
    let mut out = Vec::new();
    let iter = refs
        .local_branches()
        .map_err(|e| format!("local_branches: {e}"))?;
    for r in iter {
        let r = r.map_err(|e| format!("ref iter: {e}"))?;
        let name = r.name().shorten().to_string();
        if let gix::refs::TargetRef::Object(id) = r.target() {
            out.push(RefInfo {
                name,
                oid: id.to_hex().to_string(),
            });
        }
    }
    Ok(out)
}

fn head_oid_inner(repo: &gix::Repository) -> Option<String> {
    repo.head_id().ok().map(|id| id.to_hex().to_string())
}

fn current_branch_inner(repo: &gix::Repository) -> Option<String> {
    let head = repo.head().ok()?;
    let r = head.referent_name()?;
    Some(r.shorten().to_string())
}

pub(crate) fn commit_to_info(commit: &gix::Commit<'_>) -> Result<CommitInfo, String> {
    let raw = commit.decode().map_err(|e| format!("decode: {e}"))?;
    let author = format!("{} <{}>", raw.author.name, raw.author.email);
    let timestamp = raw.author.time().map_err(|e| format!("time: {e}"))?.seconds;
    let full_message = raw.message.to_string();
    let message = full_message.lines().next().unwrap_or("").to_string();
    let parents: Vec<String> = commit
        .parent_ids()
        .map(|p| p.detach().to_hex().to_string())
        .collect();
    Ok(CommitInfo {
        oid: commit.id().to_hex().to_string(),
        parents,
        message,
        full_message,
        author,
        timestamp,
    })
}

pub(crate) fn parse_oid(s: &str) -> Result<gix::ObjectId, String> {
    gix::ObjectId::from_hex(s.as_bytes()).map_err(|e| format!("invalid oid '{s}': {e}"))
}

fn lookup_path_in_tree(
    repo: &gix::Repository,
    tree: &gix::Tree<'_>,
    path: &str,
) -> Result<gix::ObjectId, String> {
    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return Err("empty path".into());
    }
    let mut current_tree_owned: Option<gix::Tree<'_>> = None;
    for (i, part) in parts.iter().enumerate() {
        let t = current_tree_owned.as_ref().unwrap_or(tree);
        let mut found: Option<(gix::ObjectId, bool)> = None; // (oid, is_tree)
        for entry in t.iter() {
            let entry = entry.map_err(|e| format!("tree iter: {e}"))?;
            let name = entry.filename();
            let name_bytes: &[u8] = name.as_ref();
            if name_bytes == part.as_bytes() {
                let is_tree = entry.mode().is_tree();
                found = Some((entry.oid().to_owned(), is_tree));
                break;
            }
        }
        let (oid, is_tree) = found.ok_or_else(|| format!("not found: {part} in {path}"))?;
        if i == parts.len() - 1 {
            if is_tree {
                return Err(format!("path is a tree, not a blob: {path}"));
            }
            return Ok(oid);
        }
        if !is_tree {
            return Err(format!("intermediate path is not a tree: {part}"));
        }
        let sub = repo
            .find_tree(oid)
            .map_err(|e| format!("find_tree {part}: {e}"))?;
        current_tree_owned = Some(sub);
    }
    Err("unreachable".into())
}

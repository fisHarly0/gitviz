use crate::SharedRepoState;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use serde::Serialize;
use std::collections::HashSet;
use std::io::Write;
use tauri::State;

use super::current_repo_path;
use super::open_repo_at;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LooseObject {
    /// 形如 "ab/cdef1234..." (2 + 38 char layout, git objects/ 标准布局)
    pub path: String,
    /// zlib 压缩后的 loose object bytes (header "<kind> <size>\0" + raw data, 整体 deflate)
    pub bytes: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub objects: Vec<LooseObject>,
    pub ref_name: String,
    pub head_oid: String,
}

#[tauri::command]
pub async fn export_bundle(
    state: State<'_, SharedRepoState>,
    branch: String,
) -> Result<ExportResult, String> {
    let repo_path = current_repo_path(&state)?;
    let repo = open_repo_at(&repo_path)?;

    // 解析 branch ref → head oid
    let ref_name = format!("refs/heads/{branch}");
    let r = repo
        .find_reference(ref_name.as_str())
        .map_err(|e| format!("find_reference {ref_name}: {e}"))?;
    let head_oid = match r.target() {
        gix::refs::TargetRef::Object(id) => id.to_owned(),
        gix::refs::TargetRef::Symbolic(_) => {
            return Err(format!("branch ref is symbolic, not supported: {branch}"))
        }
    };

    // 收集 reachable objects: rev_walk from head → 每 commit + 它的 tree (递归) + 所有 blobs
    let mut seen: HashSet<gix::ObjectId> = HashSet::new();
    let mut to_export: Vec<gix::ObjectId> = Vec::new();

    let walk = repo
        .rev_walk([head_oid])
        .all()
        .map_err(|e| format!("rev_walk: {e}"))?;
    for info in walk {
        let info = info.map_err(|e| format!("walk iter: {e}"))?;
        let commit_id = info.id;
        if seen.insert(commit_id) {
            to_export.push(commit_id);
        }
        let commit = repo
            .find_commit(commit_id)
            .map_err(|e| format!("find_commit {commit_id}: {e}"))?;
        let tree_id = commit
            .tree_id()
            .map_err(|e| format!("tree_id {commit_id}: {e}"))?
            .detach();
        collect_tree_recursive(&repo, tree_id, &mut seen, &mut to_export)?;
    }

    // 每个 oid dump 成 loose object 格式 (zlib-compressed)
    let mut objects: Vec<LooseObject> = Vec::with_capacity(to_export.len());
    for oid in to_export {
        let obj = repo
            .find_object(oid)
            .map_err(|e| format!("find_object {oid}: {e}"))?;
        let kind_name = match obj.kind {
            gix::object::Kind::Commit => "commit",
            gix::object::Kind::Tree => "tree",
            gix::object::Kind::Blob => "blob",
            gix::object::Kind::Tag => "tag",
        };
        let bytes = encode_loose(kind_name, &obj.data)?;
        let hex = oid.to_hex().to_string();
        if hex.len() < 3 {
            return Err(format!("invalid oid hex: {hex}"));
        }
        let path = format!("{}/{}", &hex[..2], &hex[2..]);
        objects.push(LooseObject { path, bytes });
    }

    Ok(ExportResult {
        objects,
        ref_name: branch,
        head_oid: head_oid.to_hex().to_string(),
    })
}

/// 递归收集 tree 内所有 sub-tree + blob 到 seen / to_export
fn collect_tree_recursive(
    repo: &gix::Repository,
    tree_id: gix::ObjectId,
    seen: &mut HashSet<gix::ObjectId>,
    to_export: &mut Vec<gix::ObjectId>,
) -> Result<(), String> {
    if !seen.insert(tree_id) {
        return Ok(());
    }
    to_export.push(tree_id);
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("find_tree {tree_id}: {e}"))?;
    for entry in tree.iter() {
        let entry = entry.map_err(|e| format!("tree iter: {e}"))?;
        let entry_id = entry.oid().to_owned();
        let mode = entry.mode();
        if mode.is_tree() {
            collect_tree_recursive(repo, entry_id, seen, to_export)?;
        } else if mode.is_blob() && seen.insert(entry_id) {
            to_export.push(entry_id);
        }
    }
    Ok(())
}

/// 把 raw object data 编码成 loose object format: zlib_deflate(<kind> <size>\0<data>)
fn encode_loose(kind: &str, data: &[u8]) -> Result<Vec<u8>, String> {
    let header = format!("{} {}\0", kind, data.len());
    let mut payload = Vec::with_capacity(header.len() + data.len());
    payload.extend_from_slice(header.as_bytes());
    payload.extend_from_slice(data);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&payload)
        .map_err(|e| format!("zlib write: {e}"))?;
    encoder.finish().map_err(|e| format!("zlib finish: {e}"))
}

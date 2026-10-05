//! Read-only, paged Git history for the shared version map. Writes use operations.rs.
use crate::SharedRepoState;
use serde_json::{json, Value};
use std::{collections::hash_map::DefaultHasher, hash::{Hash, Hasher}, path::{Path, PathBuf}, time::Duration};
use tauri::State;

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    super::git_process::text(root, args, Duration::from_secs(30))
}

fn state(root: &Path) -> Result<Value, String> {
    let refs = git(root, &["for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)", "refs/heads", "refs/remotes", "refs/tags"])?;
    let head = git(root, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default().trim().to_owned();
    let branch = git(root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap_or_default().trim().to_owned();
    let shallow_path = git(root, &["rev-parse", "--git-path", "shallow"])?;
    let shallow = match std::fs::read_to_string(root.join(shallow_path.trim())) { Ok(value) => value, Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(), Err(e) => return Err(e.to_string()) };
    let mut hash = DefaultHasher::new();
    (root, &refs, &head, &branch, &shallow).hash(&mut hash);
    let mut branches = Vec::new(); let mut tags = Vec::new();
    for line in refs.lines() {
        let parts: Vec<_> = line.split('\0').collect();
        if parts.len() < 3 { continue; }
        if let Some(name) = parts[0].strip_prefix("refs/tags/") {
            tags.push(json!({"name":name,"oid":if parts[2].is_empty() {parts[1]} else {parts[2]}}));
        } else if !parts[0].ends_with("/HEAD") {
            let remote = parts[0].starts_with("refs/remotes/");
            let name = parts[0].strip_prefix(if remote {"refs/remotes/"} else {"refs/heads/"}).unwrap_or(parts[0]);
            branches.push(json!({"name":name,"oid":parts[1],"remote":remote}));
        }
    }
    Ok(json!({"head": if head.is_empty() { Value::Null } else {json!(head)}, "branch":branch,"branches":branches,"tags":tags,"revision":format!("{:016x}",hash.finish()),"shallow":!shallow.is_empty()}))
}

fn assert_revision(root: &Path, revision: &str) -> Result<Value, String> {
    let state = state(root)?;
    if state["revision"] != revision { return Err("历史已变化，请刷新版本树后继续。".into()); }
    Ok(state)
}

fn history_args(state: &Value) -> Vec<&'static str> {
    let mut args = vec!["--topo-order", "--branches", "--tags", "--remotes"];
    if !state["head"].is_null() { args.push("HEAD"); }
    args
}

fn parse_fields(fields: &[&str]) -> Value {
    json!({"oid":fields[0].trim(),"parents":fields[1].split_whitespace().collect::<Vec<_>>(),"author":fields[2],"timestamp":fields[3].parse::<i64>().unwrap_or(0),"message":fields[4]})
}

fn read_page(root: &Path, state: &Value, offset: u64, count: u64) -> Result<Vec<Value>, String> {
    let skip = format!("--skip={offset}"); let max = format!("--max-count={count}");
    let mut args = vec!["log"]; args.extend(history_args(state));
    args.extend([skip.as_str(), max.as_str(), "-z", "--format=%H%x00%P%x00%an%x00%at%x00%s", "--"]);
    let log = git(root, &args)?;
    let fields: Vec<_> = log.split('\0').collect();
    Ok(fields.chunks_exact(5).map(parse_fields).collect())
}

pub(crate) fn snapshot(root: &Path, limit: u64) -> Result<Value, String> {
    let mut state = state(root)?;
    let count = limit.clamp(20, 2000);
    let has_history = !state["head"].is_null() || state["branches"].as_array().unwrap().len() + state["tags"].as_array().unwrap().len() > 0;
    let mut commits = if has_history { read_page(root, &state, 0, count + 1)? } else { Vec::new() };
    let more = commits.len() > count as usize; commits.truncate(count as usize);
    let head_pinned = !state["head"].is_null() && !commits.iter().any(|commit| commit["oid"] == state["head"]);
    let mut offset = commits.len();
    if head_pinned {
        let log = git(root, &["log", "-1", "-z", "--format=%H%x00%P%x00%an%x00%at%x00%s", state["head"].as_str().unwrap(), "--"])?;
        let fields: Vec<_> = log.split('\0').collect();
        if fields.len() >= 5 {
            if commits.len() >= count as usize { commits.pop(); offset -= 1; }
            let mut commit = parse_fields(&fields[..5]); commit["outsideWindow"] = json!(true); commits.push(commit);
        }
    }
    let mut args = vec!["rev-list", "--count"]; args.extend(history_args(&state));
    let total = if has_history { git(root, &args)?.trim().parse::<u64>().map_err(|e|e.to_string())? } else {0};
    let next = if more || head_pinned {json!({"revision":state["revision"],"offset":offset})} else {Value::Null};
    state["repo"] = json!(root.to_string_lossy()); state["name"] = json!(root.file_name().unwrap_or_default().to_string_lossy());
    state["dirty"] = json!(!git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"])?.is_empty());
    state["commits"] = json!(commits); state["nextCursor"] = next.clone(); state["total"] = json!(total);
    state["limit"] = json!(count); state["headPinned"] = json!(head_pinned); state["truncated"] = json!(!next.is_null()); state["writable"] = json!(false);
    assert_revision(root, state["revision"].as_str().unwrap())?;
    Ok(state)
}

pub(crate) fn page(root: &Path, params: &Value) -> Result<Value, String> {
    let revision = params["cursor"]["revision"].as_str().ok_or("历史分页已失效。")?;
    let offset = params["cursor"]["offset"].as_u64().filter(|v|*v <= 9_007_199_254_740_991).ok_or("无效的历史位置。")?;
    let count = params["limit"].as_u64().unwrap_or(300).clamp(20, 2000);
    let state = assert_revision(root, revision)?;
    let mut commits = read_page(root, &state, offset, count + 1)?;
    let next = if commits.len() > count as usize { json!({"revision":revision,"offset":offset+count}) } else {Value::Null};
    commits.truncate(count as usize); assert_revision(root, revision)?;
    Ok(json!({"commits":commits,"revision":revision,"nextCursor":next}))
}

pub(crate) fn search(root: &Path, params: &Value) -> Result<Value, String> {
    let query = params["query"].as_str().filter(|q|!q.trim().is_empty() && q.chars().count() <= 256).ok_or("请输入 1–256 个字符搜索历史。")?;
    let revision = params["revision"].as_str().ok_or("缺少历史版本，请刷新。")?;
    let state = assert_revision(root, revision)?;
    let cursor = &params["cursor"];
    if !cursor.is_null() && (cursor["revision"] != revision || cursor["query"] != query) { return Err("搜索分页已失效。".into()); }
    let skip = if cursor.is_null() {0} else {cursor["offset"].as_u64().ok_or("无效的搜索位置。")?};
    let count = params["limit"].as_u64().unwrap_or(50).clamp(1, 100) as usize;
    if state["head"].is_null() && state["branches"].as_array().unwrap().is_empty() && state["tags"].as_array().unwrap().is_empty() { return Ok(json!({"commits":[],"revision":revision,"nextCursor":null})); }
    let mut args = vec!["log"]; args.extend(history_args(&state)); args.extend(["-z", "--format=%H%x00%P%x00%an%x00%at%x00%s", "--"]);
    let mut matches = 0u64; let mut found = Vec::new(); let needle = query.trim().to_lowercase();
    let mut raw = Vec::new(); let mut fields = Vec::new();
    super::git_process::run(root, &args, Duration::from_secs(30), 32 * 1024 * 1024, Some(&mut |bytes| {
        for byte in bytes {
            if *byte != 0 {
                raw.push(*byte);
                if raw.len() > 2 * 1024 * 1024 { return Err("单条历史信息过大，无法继续搜索。".into()); }
                continue;
            }
            fields.push(String::from_utf8_lossy(&raw).into_owned()); raw.clear();
            if fields.len() != 5 { continue; }
            let commit = parse_fields(&fields.iter().map(String::as_str).collect::<Vec<_>>());
            fields.clear();
            let refs = state["branches"].as_array().unwrap().iter().chain(state["tags"].as_array().unwrap()).filter(|r|r["oid"] == commit["oid"]).map(|r|r["name"].as_str().unwrap_or("")).collect::<Vec<_>>().join(" ");
            if format!("{} {} {} {}", commit["oid"].as_str().unwrap(), commit["author"].as_str().unwrap(), commit["message"].as_str().unwrap(), refs).to_lowercase().contains(&needle) {
                if matches >= skip { found.push(commit); }
                matches += 1;
                if found.len() > count { return Ok(false); }
            }
        }
        Ok(true)
    })).map_err(|failure|super::git_process::describe(root, failure))?;
    assert_revision(root, revision)?;
    let next = if found.len() > count {json!({"revision":revision,"query":query,"offset":skip+count as u64})} else {Value::Null};
    found.truncate(count);
    Ok(json!({"commits":found,"revision":revision,"nextCursor":next}))
}

#[tauri::command]
pub async fn history_snapshot(state: State<'_, SharedRepoState>, limit: Option<u64>) -> Result<Value, String> {
    let root = super::current_repo_path(&state)?;
    tauri::async_runtime::spawn_blocking(move || snapshot(&root, limit.unwrap_or(300))).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn history_page(state: State<'_, SharedRepoState>, params: Value) -> Result<Value, String> {
    let root: PathBuf = super::current_repo_path(&state)?;
    tauri::async_runtime::spawn_blocking(move || page(&root, &params)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn history_search(state: State<'_, SharedRepoState>, params: Value) -> Result<Value, String> {
    let root = super::current_repo_path(&state)?;
    tauri::async_runtime::spawn_blocking(move || search(&root, &params)).await.map_err(|e|e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paged_history_real_large_repositories() {
        let Ok(report_path) = std::env::var("GITVIZ_HISTORY_FIXTURES") else {
            eprintln!("Set GITVIZ_HISTORY_FIXTURES to the large-history test report to run real Git fixtures.");
            return;
        };
        let fixtures: Value = serde_json::from_str(&std::fs::read_to_string(report_path).unwrap()).unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let root = Path::new(fixture["root"].as_str().unwrap());
            let started = std::time::Instant::now();
            let initial = snapshot(root, 300).unwrap();
            assert_eq!(initial["total"], fixture["count"]);
            let mut commits = initial["commits"].as_array().unwrap().clone();
            let mut cursor = initial["nextCursor"].clone();
            while !cursor.is_null() {
                let next = page(root, &json!({"cursor":cursor,"limit":1000})).unwrap();
                commits.extend(next["commits"].as_array().unwrap().iter().cloned());
                cursor = next["nextCursor"].clone();
            }
            let mut actual = std::collections::BTreeMap::new();
            for commit in &commits {
                assert!(actual.insert(commit["oid"].as_str().unwrap().to_owned(), commit["parents"].as_array().unwrap().iter().map(|p|p.as_str().unwrap().to_owned()).collect::<Vec<_>>()).is_none());
            }
            let expected: std::collections::BTreeMap<_, _> = git(root, &["rev-list", "--all", "--parents"]).unwrap().lines().map(|line| {
                let mut fields = line.split_whitespace(); (fields.next().unwrap().to_owned(), fields.map(str::to_owned).collect::<Vec<_>>())
            }).collect();
            assert_eq!(actual, expected);
            let found = search(root, &json!({"query":"root-marker","revision":initial["revision"]})).unwrap();
            assert_eq!(found["commits"][0]["oid"], fixture["first"]);
            let found = search(root, &json!({"query":"origin-point","revision":initial["revision"]})).unwrap();
            assert_eq!(found["commits"][0]["oid"], fixture["first"]);
            let found = search(root, &json!({"query":"save","revision":initial["revision"],"limit":50})).unwrap();
            let next = search(root, &json!({"query":"save","revision":initial["revision"],"cursor":found["nextCursor"],"limit":50})).unwrap();
            assert_ne!(found["commits"][0]["oid"], next["commits"][0]["oid"]);
            assert!(page(root, &json!({"cursor":{"revision":"stale","offset":0}})).unwrap_err().contains("历史已变化"));
            assert_eq!(git(root, &["rev-parse", "HEAD"]).unwrap().trim(), initial["head"].as_str().unwrap());
            println!("Rust Git history {} commits verified in {:?}", commits.len(), started.elapsed());
        }
    }
}

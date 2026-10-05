//! Operation records shared with the Node hosts. No editor contents are stored.
use super::operations::{git, nonce, Expected};
use serde_json::{json, Value};
use std::{fs, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

const MAX_BYTES: u64 = 65536;
pub fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn valid_id(id: &str) -> bool { id.len() == 45 && id.as_bytes()[12] == b'-' && id.bytes().enumerate().all(|(i,b)| i == 12 || b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn unlinked(path: &Path, directory: bool) -> Result<(), String> {
    let info = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if info.file_type().is_symlink() || (directory && !info.is_dir()) || (!directory && !info.is_file()) { return Err("操作记录不能经过链接，且必须是普通文件或目录。".into()); }
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if info.file_attributes() & 0x400 != 0 { return Err("操作记录不能经过 Windows 重解析点。".into()); } }
    if !directory && info.len() > MAX_BYTES { return Err("操作记录超过大小限制。".into()); }
    Ok(())
}
fn directory(root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let mut folder = fs::canonicalize(git(root, &["rev-parse", "--absolute-git-dir"])?.trim()).map_err(|e| e.to_string())?;
    for name in ["gitviz", "operations"] {
        folder.push(name);
        if create { match fs::create_dir(&folder) { Ok(()) => {}, Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}, Err(e) => return Err(e.to_string()) } }
        if fs::symlink_metadata(&folder).is_err_and(|e|e.kind() == std::io::ErrorKind::NotFound) { return Ok(None); }
        unlinked(&folder, true)?;
    }
    Ok(Some(folder))
}
pub fn read(root: &Path, id: &str) -> Result<Value, String> {
    if !valid_id(id) { return Err("无效的操作记录编号。".into()); }
    let folder = directory(root, false)?.ok_or("操作记录不存在。")?;
    read_in(root,&folder,id)
}
fn read_in(root: &Path, folder: &Path, id: &str) -> Result<Value,String> {
    let file = folder.join(format!("{id}.json"));
    unlinked(&file, false)?;
    let record: Value = serde_json::from_slice(&fs::read(&file).map_err(|e| e.to_string())?).map_err(|e|format!("操作记录损坏：{e}"))?;
    let repo = record["repo"].as_str().ok_or("操作记录缺少仓库。")?;
    if record["version"] != 1 || record["id"] != id || fs::canonicalize(repo).map_err(|e|e.to_string())? != fs::canonicalize(root).map_err(|e|e.to_string())? { return Err("操作记录不属于当前工作区或版本不支持。".into()); }
    Ok(record)
}
pub fn list(root: &Path, before: Option<&str>, limit: usize) -> Result<Value, String> {
    if before.is_some_and(|id|!valid_id(id)) { return Err("操作记录分页已失效。".into()); }
    let Some(folder) = directory(root, false)? else { return Ok(json!({"records":[],"nextCursor":null})); };
    let mut ids: Vec<String> = fs::read_dir(&folder).map_err(|e| e.to_string())?.filter_map(|entry| {
        let name = entry.ok()?.file_name().to_str()?.to_owned();
        let id = name.strip_suffix(".json")?;
        (valid_id(id) && before.map_or(true,|b| id < b)).then(||id.to_owned())
    }).collect();
    ids.sort_unstable_by(|a,b|b.cmp(a));
    let count = limit.clamp(1,100);
    let records: Vec<Value> = ids.iter().take(count).map(|id| read_in(root,&folder,id).unwrap_or_else(|error|json!({"id":id,"state":"unreadable","error":error}))).collect();
    Ok(json!({"records":records,"nextCursor":if ids.len() > count {json!(ids[count-1])} else {Value::Null}}))
}
pub fn save(root: &Path, record: &Value) -> Result<(), String> {
    let id = record["id"].as_str().filter(|id|valid_id(id)).ok_or("无效的操作记录编号。")?;
    let folder = directory(root,true)?.ok_or("无法创建操作记录目录。")?;
    let target = folder.join(format!("{id}.json"));
    if fs::symlink_metadata(&target).is_ok() { unlinked(&target,false)?; }
    let data = serde_json::to_vec_pretty(record).map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BYTES { return Err("操作记录超过大小限制。".into()); }
    let temporary = folder.join(format!("{id}.{}.tmp",nonce()?));
    let mut options = fs::OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&temporary).map_err(|e|e.to_string())?;
    file.write_all(&data).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?; drop(file);
    fs::rename(temporary,target).map_err(|e|e.to_string())
}
pub fn begin(root: &Path, before: &Expected, mut params: Value) -> Result<Value, String> {
    let values = params.as_object_mut().ok_or("无效的动作参数。")?;
    values.remove("content"); let action = values.remove("action").ok_or("缺少动作。")?;
    let started = now();
    let record = json!({"version":1,"id":format!("{started:012x}-{}",nonce()?),"action":action,"params":params,"before":before,
        "repo":git(root,&["rev-parse","--show-toplevel"])?.trim(),"state":"running","startedAt":started,"updatedAt":started,"attempts":1});
    save(root,&record)?; Ok(record)
}
pub fn checkpoint(root: &Path, record: &mut Value, message: &str) -> Result<(), String> {
    record["checkpoint"] = json!({"tree":git(root,&["write-tree"])?.trim(),"message":message});
    record["updatedAt"] = json!(now()); save(root,record)
}
pub fn finish(root: &Path, record: &mut Value, result: &Result<Value,String>) -> Result<(), String> {
    record["state"] = json!(if result.is_ok() {"completed"} else {"failed"}); record["updatedAt"] = json!(now());
    record["error"] = match result { Ok(_) => Value::Null, Err(error) => json!(error.chars().take(4000).collect::<String>()) };
    if !record["error"].is_null() { record["lastError"] = record["error"].clone(); }
    let mut actual = result.as_ref().cloned().unwrap_or_else(|_|json!({}));
    actual["head"] = git(root,&["rev-parse","--verify","HEAD"]).ok().map(|s|json!(s.trim())).unwrap_or(Value::Null);
    actual["branch"] = json!(git(root,&["symbolic-ref","--quiet","--short","HEAD"]).unwrap_or_default().trim());
    record["result"] = actual; save(root,record)
}

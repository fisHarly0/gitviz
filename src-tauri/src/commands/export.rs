use crate::SharedRepoState;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub packfile: Vec<u8>,
    pub packname: String,
    pub ref_name: String,
    pub head_oid: String,
}

#[tauri::command]
pub async fn export_bundle(
    state: State<'_, SharedRepoState>,
    branch: String,
) -> Result<ExportResult, String> {
    let _ = (state, branch);
    Err("export_bundle: not yet implemented in Tauri-1 (coming in P-Tauri-1.3)".into())
}

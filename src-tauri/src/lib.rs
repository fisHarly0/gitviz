mod commands;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct RepoState {
    pub repo_path: PathBuf,
}

pub type SharedRepoState = Arc<Mutex<Option<RepoState>>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage::<SharedRepoState>(Arc::new(Mutex::new(None)))
        .manage::<commands::operations::SharedOperations>(Default::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repo,
            commands::repo::list_branches,
            commands::repo::list_commits,
            commands::history::history_snapshot,
            commands::history::history_page,
            commands::history::history_search,
            commands::repo::get_commit_detail,
            commands::repo::read_file_at,
            commands::operations::desktop_prepare,
            commands::operations::desktop_execute,
            commands::operations::desktop_cancel,
            commands::branch::current_branch,
            commands::branch::head_oid,
            commands::export::export_bundle,
            commands::export::save_export_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod commands;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct RepoState {
    pub repo_path: PathBuf,
}

pub type SharedRepoState = Mutex<Option<RepoState>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage::<SharedRepoState>(Mutex::new(None))
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
            commands::repo::get_commit_detail,
            commands::repo::read_file_at,
            commands::branch::create_branch,
            commands::branch::checkout,
            commands::branch::current_branch,
            commands::branch::head_oid,
            commands::branch::write_file,
            commands::branch::add_and_commit,
            commands::export::export_bundle,
            commands::export::save_export_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

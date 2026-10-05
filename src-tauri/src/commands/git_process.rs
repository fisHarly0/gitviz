//! Bounded Git execution. A timeout must include pipe drainage and tree cleanup.
use std::{collections::HashSet, io::Read, path::{Path, PathBuf}, process::{Child, Command, ExitStatus, Stdio}, sync::{mpsc, Mutex, OnceLock}, time::{Duration, Instant}};

static UNCERTAIN: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
fn root_key(root: &Path) -> PathBuf { std::fs::canonicalize(root).unwrap_or_else(|_|root.to_path_buf()) }
pub fn is_uncertain(root: &Path) -> bool {
    UNCERTAIN.get_or_init(Default::default).lock().map(|set|set.contains(&root_key(root))).unwrap_or(true)
}
fn mark_uncertain(root: &Path) { if let Ok(mut set) = UNCERTAIN.get_or_init(Default::default).lock() { set.insert(root_key(root)); } }

#[derive(Debug)]
pub struct ProcessError { pub message: String, pub uncertain: bool }
fn error(message: impl Into<String>, uncertain: bool) -> ProcessError { ProcessError { message: message.into(), uncertain } }
pub fn describe(root: &Path, failure: ProcessError) -> String {
    if failure.uncertain {
        mark_uncertain(root);
        format!("{}\n无法确认 Git 及其子进程已停止；本会话暂停写入。请先检查进程和 Git 状态，再处理保留的操作锁。", failure.message)
    } else { failure.message }
}

pub fn command(root: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(root).args(["--no-optional-locks", "-c", "core.quotepath=false"])
        .env("GIT_TERMINAL_PROMPT", "0").env("GIT_LITERAL_PATHSPECS", "1");
    #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    #[cfg(unix)] { use std::os::unix::process::CommandExt; cmd.process_group(0); }
    cmd
}

fn terminate(child: &mut Child) -> Result<(), String> {
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        if child.try_wait().map_err(|e|e.to_string())?.is_some() { return Err("主进程已退出，不能再按旧 PID 终止进程树。".into()); }
        let system = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(||PathBuf::from("C:/Windows"));
        let mut killer = Command::new(system.join("System32/taskkill.exe"))
            .args(["/PID", &child.id().to_string(), "/T", "/F"]).creation_flags(0x08000000)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;
        let end = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(status) = killer.try_wait().map_err(|e|e.to_string())? {
                return if status.success() { Ok(()) } else { Err("进程树终止未成功。".into()) };
            }
            if Instant::now() >= end { let _ = killer.kill(); let _ = killer.wait(); return Err("进程树终止超时。".into()); }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    #[cfg(unix)] {
        extern "C" { fn kill(pid: i32, signal: i32) -> i32; }
        // The child was placed in its own group by CommandExt::process_group.
        if unsafe { kill(-(child.id() as i32), 9) } == 0 { Ok(()) } else { Err(std::io::Error::last_os_error().to_string()) }
    }
    #[cfg(not(any(windows, unix)))] { child.kill().map_err(|e|e.to_string()) }
}

enum Stream { Data(bool, Vec<u8>), Closed(bool), Failed(String) }
fn pump(mut pipe: impl Read + Send + 'static, stdout: bool, send: mpsc::SyncSender<Stream>) {
    std::thread::spawn(move || {
        let mut bytes = [0u8; 8192];
        loop {
            match pipe.read(&mut bytes) {
                Ok(0) => break,
                Ok(count) => { if send.send(Stream::Data(stdout, bytes[..count].to_vec())).is_err() { return; } }
                Err(error) => { let _ = send.send(Stream::Failed(format!("读取 Git 输出失败：{error}"))); break; }
            }
        }
        let _ = send.send(Stream::Closed(stdout));
    });
}

pub fn run(root: &Path, args: &[&str], timeout: Duration, limit: usize, mut on_stdout: Option<&mut dyn FnMut(&[u8]) -> Result<bool, String>>) -> Result<Vec<u8>, ProcessError> {
    let mut child = command(root).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e|error(format!("无法启动 Git：{e}"), false))?;
    let (send, receive) = mpsc::sync_channel(8);
    pump(child.stdout.take().unwrap(), true, send.clone());
    pump(child.stderr.take().unwrap(), false, send);
    let mut out = Vec::new(); let mut err = Vec::new();
    let mut out_closed = false; let mut err_closed = false; let mut status: Option<ExitStatus> = None;
    let mut reason = None; let mut stopping = false; let mut stop_requested = false; let mut cleanup_failed = false;
    let mut deadline = Instant::now() + timeout;
    loop {
        if status.is_none() { status = child.try_wait().map_err(|e|error(format!("无法确认 Git 退出状态：{e}"), true))?; }
        if let Some(exit) = &status {
            if out_closed && err_closed {
                if cleanup_failed && !exit.success() { return Err(error(reason.unwrap_or_else(||"Git 搜索已停止。".into()), true)); }
                if let Some(reason) = reason { return Err(error(reason, false)); }
                if !exit.success() && !stopping {
                    let message = String::from_utf8_lossy(&err).trim().to_owned();
                    return Err(error(if message.is_empty() {format!("Git 未正常结束（{exit}）。请检查 Git 状态。")} else {message}, false));
                }
                return Ok(out);
            }
        }
        if Instant::now() >= deadline {
            if stopping { return Err(error(reason.unwrap_or_else(||"Git 读取已停止，但输出未关闭。".into()), true)); }
            reason = Some(format!("Git 操作超过 {} 秒。已产生的更改会保留，请检查 Git 状态与操作记录。", timeout.as_secs_f64()));
            stop_requested = true;
        }
        if stop_requested && !stopping {
            stopping = true;
            cleanup_failed = terminate(&mut child).is_err();
            deadline = Instant::now() + Duration::from_secs(2);
        }
        match receive.recv_timeout(Duration::from_millis(10)) {
            Ok(Stream::Closed(stdout)) => { if stdout { out_closed = true; } else { err_closed = true; } }
            Ok(Stream::Failed(message)) => { if !stopping { reason = Some(message); stop_requested = true; } }
            Ok(Stream::Data(stdout, bytes)) if !stopping => {
                if stdout && on_stdout.is_some() {
                    match on_stdout.as_mut().unwrap()(&bytes) {
                        Ok(true) => {}, Ok(false) => { stop_requested = true; },
                        Err(message) => { reason = Some(message); stop_requested = true; }
                    }
                } else {
                    let target = if stdout { &mut out } else { &mut err };
                    if target.len().saturating_add(bytes.len()) > limit {
                        reason = Some("Git 输出超过大小限制，结果未被作为完整数据使用。请缩小读取范围或检查钩子。".into()); stop_requested = true;
                    } else { target.extend_from_slice(&bytes); }
                }
            }
            Ok(Stream::Data(_, _)) | Err(mpsc::RecvTimeoutError::Timeout) => {},
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if !out_closed || !err_closed { return Err(error("Git 输出管道意外断开，无法确认完整结果。", true)); }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
}

pub fn text(root: &Path, args: &[&str], timeout: Duration) -> Result<String, String> {
    run(root, args, timeout, 32 * 1024 * 1024, None).map(|data|String::from_utf8_lossy(&data).into_owned()).map_err(|failure|describe(root, failure))
}

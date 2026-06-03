// POS Suite desktop (Tauri v2).
//
// Hosts the built web SPA (frontendDist in tauri.conf.json). The SPA runs as a CLIENT and
// talks to whatever POS server the user configures in the setup wizard (resolved at runtime
// by apiBase() in the web client).
//
// Server role (Phase 2b): when the user picks "Server" in the wizard, the web side calls the
// `set_desktop_role` command, which persists the role to a native config file. On the next
// launch, if role == "server" AND a launch command is configured, the shell spawns the API
// server as a managed child process and kills it on exit. (Bundling Node + the server, and the
// Postgres it connects to, is packaging/environment — the server's DATABASE_URL must point at a
// reachable Postgres. The launch command/cwd/env live in the config so packaging can set them
// without code changes.)
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[derive(serde::Deserialize, serde::Serialize, Default)]
struct DesktopConfig {
    #[serde(default)]
    role: Option<String>,
    /// Command to launch the API server (e.g. "node"). When unset, nothing is spawned.
    #[serde(default)]
    server_cmd: Option<String>,
    #[serde(default)]
    server_args: Option<Vec<String>>,
    #[serde(default)]
    server_cwd: Option<String>,
    /// Extra env for the server child (e.g. DATABASE_URL, PORT, WEB_DIST).
    #[serde(default)]
    server_env: Option<HashMap<String, String>>,
}

/// The managed API-server child process, killed when the app exits.
struct ServerProcess(Mutex<Option<Child>>);

fn config_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("pos-desktop.json"))
}

fn read_config(app: &tauri::AppHandle) -> DesktopConfig {
    config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist the chosen role (called from the web setup wizard via invoke).
#[tauri::command]
fn set_desktop_role(app: tauri::AppHandle, role: String) -> Result<(), String> {
    let mut cfg = read_config(&app);
    cfg.role = Some(role);
    let path = config_path(&app).ok_or("no config directory")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// In Server role, launch the API server as a child process — only when a launch command is
/// configured (packaging/dev sets server_cmd/cwd/env). Returns None otherwise.
fn start_server_if_configured(app: &tauri::AppHandle) -> Option<Child> {
    let cfg = read_config(app);
    if cfg.role.as_deref() != Some("server") {
        return None;
    }
    let cmd = cfg.server_cmd?;
    let mut c = Command::new(cmd);
    if let Some(args) = cfg.server_args {
        c.args(args);
    }
    if let Some(cwd) = cfg.server_cwd {
        c.current_dir(cwd);
    }
    if let Some(env) = cfg.server_env {
        c.envs(env);
    }
    c.spawn().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_desktop_role])
        .setup(|app| {
            let child = start_server_if_configured(&app.handle());
            app.manage(ServerProcess(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building the POS Suite desktop app")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

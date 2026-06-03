// POS Suite desktop (Tauri v2). The app simply hosts the built web SPA (frontendDist in
// tauri.conf.json); the SPA runs as a CLIENT and talks to whatever POS server the user
// configures in-app (Login → server connection), resolved at runtime by apiBase(). No custom
// Tauri commands are needed yet — the Server role (launching the bundled API locally) is a
// later phase.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the POS Suite desktop app");
}

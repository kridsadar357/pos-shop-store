# POS Suite — Desktop app (Tauri)

Runs the POS UI as a native desktop window (Windows / macOS / Linux) using **Tauri** — the OS
webview (WKWebView / WebView2 / WebKitGTK), not a bundled Chromium, so binaries are small
(~10 MB) and memory use is low. The desktop app is a **client**: it connects to a POS
**server** (the Express + Postgres backend) over the LAN.

```
┌──────────────────────┐        LAN / HTTP         ┌──────────────────────────┐
│  POS Suite (Tauri)    │ ───────────────────────▶ │  POS server (server/)     │
│  OS webview + built SPA│  /api  (CORS_ORIGIN=*)   │  Express + Postgres       │
└──────────────────────┘                           └──────────────────────────┘
```

## Prerequisites
- **Rust** + Cargo (https://rustup.rs) and the **Tauri CLI** (`cargo install tauri-cli` — or it's
  vendored). Platform webview deps: macOS = nothing extra; Windows = WebView2 runtime;
  Linux = `webkit2gtk`.

## Run it (dev)
1. Build the web SPA (Tauri serves `web/dist` in release; uses the Vite dev server in dev):
   ```bash
   npm --prefix web run build      # release, or `npm --prefix web run dev` on :5173 for live reload
   ```
2. Launch:
   ```bash
   cd desktop && npm run dev        # = cargo tauri dev
   ```
3. On first launch, click **“ตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์”** on the login screen and enter the
   server URL, e.g. `http://192.168.1.50:4000`. It tests `GET /health`, saves, and reloads.

## Server side (one machine on the LAN)
Start the server allowing cross-origin clients (auth is bearer-token, not cookies, so `*` is safe):
```bash
CORS_ORIGIN=* npm --prefix server start     # or a comma-separated allow-list
```
The single-image Docker deploy (`docker-compose.prod.yml`) is the easiest way to host it.

## Package installers
```bash
npm --prefix web run build
cd desktop && npm run build         # = cargo tauri build  → .dmg / .msi / .AppImage
```

## How it works
- `src-tauri/tauri.conf.json` → `build.frontendDist = "../../web/dist"` (release) and
  `build.devUrl = "http://localhost:5173"` (dev). Tauri's webview handles SPA routing +
  `localStorage` natively.
- `src-tauri/src/lib.rs` is a minimal `tauri::Builder` that just hosts the SPA — no custom Rust
  commands yet.
- The server URL is resolved at runtime by the web client's `apiBase()`
  (`window.__POS_API_BASE__` → `localStorage 'pos_api_base'` → build-time env → same-origin);
  the connection screen writes `localStorage`.

## Status / roadmap
- **Done:** Tauri client shell + in-app server connection. `cargo check` passes.
- **Next:** a role picker in the setup wizard (**Server** vs **Client**), and a **Server** role
  that launches/embeds the API server locally (Tauri sidecar) so the main terminal is all-in-one.

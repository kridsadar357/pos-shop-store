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

## Package installers (all-in-one: UI + bundled API server)
```bash
cd desktop && npm run build         # = npm run bundle && cargo tauri build
```
`npm run bundle` (scripts/bundle.mjs) builds the web SPA + server and stages a **production
server** (dist + prisma + prod node_modules + the generated Prisma client) into
`src-tauri/resources/server/`; `cargo tauri build` then folds it into the app and emits
`.dmg` / `.msi` / `.AppImage`. The Rust launcher runs that bundled server in Server mode.

> **Build per target OS.** The staged Prisma query engine is platform-specific
> (`libquery_engine-<platform>`), so build the installer on the OS you're shipping to.
> **Postgres is not bundled** — provide a reachable `DATABASE_URL` in the Server setup wizard
> (a local or LAN Postgres; the repo's `docker-compose` can host just Postgres).

## How it works
- `src-tauri/tauri.conf.json` → `build.frontendDist = "../../web/dist"` (release) and
  `build.devUrl = "http://localhost:5173"` (dev). Tauri's webview handles SPA routing +
  `localStorage` natively.
- `src-tauri/src/lib.rs` is a minimal `tauri::Builder` that just hosts the SPA — no custom Rust
  commands yet.
- The server URL is resolved at runtime by the web client's `apiBase()`
  (`window.__POS_API_BASE__` → `localStorage 'pos_api_base'` → build-time env → same-origin);
  the connection screen writes `localStorage`.

## Server role (auto-launch the API locally)
When the setup wizard picks **Server**, the app writes the role to a native config file
(`pos-desktop.json` in the OS app-config dir). On the next launch, if a launch command is
configured there, the shell spawns the API server as a managed child process (killed on exit).
Configure it (so packaging/dev can set the command without code changes), e.g.:

```jsonc
// <app-config-dir>/pos-desktop.json
{
  "role": "server",
  "server_cmd": "node",
  "server_args": ["dist/src/index.js"],
  "server_cwd": "/path/to/server",
  "server_env": { "DATABASE_URL": "postgresql://…", "PORT": "4000", "WEB_DIST": "" }
}
```
**Postgres is required** — the spawned server connects to the `DATABASE_URL` you provide (a local
or LAN Postgres). Bundling Node + the server binary + Postgres into the installer is the remaining
packaging work.

## Status / roadmap
- **Done:** Tauri client shell + in-app server connection; setup wizard with **Server/Client**
  role picker; native server-launcher (spawns/kills the API child process in Server role when
  `server_cmd` is configured). `cargo check` passes; wizard verified in-browser.
- **Next:** bundle Node + the server + a Postgres strategy into the installer so the Server role
  is truly one-click all-in-one.

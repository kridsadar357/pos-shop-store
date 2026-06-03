# POS Suite — Desktop app (Electron)

Runs the POS UI as a native desktop window (Windows / macOS / Linux). The desktop app is a
**client**: it connects to a POS **server** (the Express + Postgres backend) over the LAN.

```
┌─────────────────────┐        LAN / HTTP         ┌──────────────────────────┐
│  POS Suite (desktop) │ ───────────────────────▶ │  POS server (server/)     │
│  Electron + built SPA│   /api  (CORS_ORIGIN=*)   │  Express + Postgres       │
└─────────────────────┘                           └──────────────────────────┘
```

## Run it (dev)

1. Build the web SPA first (the desktop app serves `web/dist`):
   ```bash
   npm --prefix web run build
   ```
2. Install + launch:
   ```bash
   cd desktop && npm install && npm start
   ```
3. On first launch, click **“ตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์”** on the login screen and enter the
   server URL, e.g. `http://192.168.1.50:4000`. It tests `GET /health`, saves, and reloads.

## Server side (one machine on the LAN)

The server must allow cross-origin clients — start it with:
```bash
CORS_ORIGIN=* npm --prefix server start     # or a comma-separated allow-list
```
(Auth is bearer-token, not cookies, so `*` is safe.) The single-image Docker deploy
(`docker-compose.prod.yml`) is the easiest way to host the server.

## Package installers
```bash
npm --prefix web run build        # refresh the bundled SPA
cd desktop
npm run dist:mac                  # .dmg     (build.extraResources copies web/dist → resources/web-dist)
npm run dist:win                  # .exe (NSIS)
```

## How it works
- `main.js` serves `web/dist` from a tiny in-process static server on `127.0.0.1:<random>` (so
  React Router history, `localStorage`, and the service worker all work — unlike `file://`),
  then loads it in a `BrowserWindow`.
- `preload.js` exposes `window.__POS_DESKTOP__ = true` (contextIsolation-safe).
- The server URL is resolved at runtime by the web client's `apiBase()`
  (`window.__POS_API_BASE__` → `localStorage 'pos_api_base'` → build-time env → same-origin);
  the connection screen writes `localStorage`.

## Status / roadmap
- **Done:** client desktop shell + in-app server connection (this phase).
- **Next:** a role picker in the setup wizard (**Server** vs **Client**), and a **Server** role
  that launches the bundled API server locally so the main terminal is all-in-one.

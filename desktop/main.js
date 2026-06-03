// POS Suite desktop (Electron) main process.
//
// Serves the built web SPA from a tiny in-process static server on 127.0.0.1 (so React
// Router history + localStorage + the service worker all work — unlike file://), then loads
// it in a window. The app runs as a CLIENT: it talks to whatever POS server the user
// configures in-app (Login → "ตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์"), which persists to localStorage and
// is picked up by apiBase() in the web client. Bundling/launching the API server locally
// (the "Server" role) is a later phase.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

// In dev the SPA build sits at ../web/dist; when packaged, electron-builder copies it to
// resources/web-dist (see package.json build.extraResources).
const DIST = app.isPackaged ? path.join(process.resourcesPath, 'web-dist') : path.join(__dirname, '..', 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = path.join(DIST, urlPath);
      // SPA fallback: unknown paths (client routes) serve index.html.
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(DIST, 'index.html');
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function createWindow() {
  let url;
  try {
    const port = await startStaticServer();
    url = `http://127.0.0.1:${port}/`;
  } catch {
    url = 'about:blank';
  }
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    backgroundColor: '#0b1220',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  // Open external links (e.g. mailto / docs) in the system browser, not the app window.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/.test(u)) { shell.openExternal(u); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

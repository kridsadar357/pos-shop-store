// Exposes a desktop flag to the web app (contextIsolation-safe). The web client checks
// window.__POS_DESKTOP__ to tailor desktop behaviour (e.g. nudging first-run server setup).
// The server URL itself is configured in-app and stored in localStorage — see apiBase().
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__POS_DESKTOP__', true);

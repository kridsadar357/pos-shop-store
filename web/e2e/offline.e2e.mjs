// Headless-browser e2e for the offline POS cold-reload path — the one thing build/typecheck
// can't prove. Boots the production build (served by the API server via WEB_DIST), drives
// the real service worker + IndexedDB catalog cache:
//   1. load /pos online  -> SW precaches the shell, products render + cache to IndexedDB
//   2. go OFFLINE, reload -> assert the cashier stays logged in (auth restore is offline-
//      tolerant) AND the product grid still renders from the cache (no network)
//
// Requires: a prior `npm run build` (web/dist) and a running Postgres (server/.env). Uses the
// system Chrome via puppeteer-core. Run: `npm run test:e2e` (from web/).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '../../server');
const webDist = join(here, '../dist');
const PORT = 4100;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL:'} ${msg}`); if (!cond) failures++; };

async function waitForHealth(timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error('server did not become healthy');
}

console.log('• starting API server (WEB_DIST = built SPA) on :' + PORT);
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), WEB_DIST: webDist },
  stdio: 'ignore',
});

let browser;
try {
  await waitForHealth();
  console.log('• server healthy');

  // Real login to get a valid token + user, plus the catalog (to assert a product renders).
  const login = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
  const products = await (await fetch(`${BASE}/api/products`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
  const names = products.map((p) => p.name).filter(Boolean);
  console.log(`• logged in as ${login.user.name}; ${names.length} products`);

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [page error]', m.text()); });
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));

  // Seed the session (as if previously logged in) before the app boots.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t, u) => { localStorage.setItem('pos_token', t); localStorage.setItem('pos_user', JSON.stringify(u)); }, login.token, login.user);

  // ---- ONLINE: load the POS so the SW precaches + the catalog caches to IndexedDB ----
  await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
  const bodyHasProduct = (ns) => ns.some((n) => document.body.innerText.includes(n));
  await page.waitForFunction(bodyHasProduct, { timeout: 15000 }, names).catch(() => {});
  const onlineOk = await page.evaluate(bodyHasProduct, names);
  check(onlineOk, 'online: product grid rendered');
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'online: service worker controls the page');
  await sleep(1200); // let the IndexedDB catalog write + SW precache settle

  // ---- OFFLINE: cold reload ----
  console.log('• going OFFLINE and reloading…');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(bodyHasProduct, { timeout: 12000 }, names).catch(() => {});

  const url = page.url();
  check(/\/pos$/.test(url) && !/\/login/.test(url), `offline: stayed on POS (not bounced to /login) — url=${url}`);
  check(await page.evaluate(() => !!JSON.parse(localStorage.getItem('pos_user') || 'null')), 'offline: cashier still logged in (auth restore tolerant)');
  const productsOffline = await page.evaluate(bodyHasProduct, names);
  check(productsOffline, 'offline: product grid still renders from the cache');

  if (!productsOffline) {
    // Diagnostics: what's in the cache + what branch key did the POS use?
    const diag = await page.evaluate(async () => {
      const out = { posBranch: localStorage.getItem('pos_branch'), keys: [], counts: {} };
      try {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('pos-cache', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const keys = await new Promise((res) => { const r = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys(); r.onsuccess = () => res(r.result); });
        out.keys = keys;
        for (const k of keys) {
          const v = await new Promise((res) => { const r = db.transaction('kv', 'readonly').objectStore('kv').get(k); r.onsuccess = () => res(r.result); });
          out.counts[k] = Array.isArray(v) ? v.length : typeof v;
        }
      } catch (e) { out.err = String(e); }
      return out;
    });
    console.log('   [diag] pos_branch =', diag.posBranch);
    console.log('   [diag] IDB keys =', JSON.stringify(diag.counts), diag.err || '');
  }
} catch (e) {
  console.error('e2e error:', e.message);
  failures++;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGKILL');
}

console.log(failures ? `\nE2E FAILED (${failures})` : '\nE2E PASSED');
process.exit(failures ? 1 : 0);

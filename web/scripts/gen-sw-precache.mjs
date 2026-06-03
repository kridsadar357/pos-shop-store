// Post-build step: rewrite dist/sw.js so the service worker precaches the real built
// app-shell assets on install. Without this the SW only precaches index.html and relies
// on opportunistic runtime caching for the hashed JS/CSS chunks — which breaks a cold
// reload while offline right after a deploy (new hashes not yet fetched). Run after
// `vite build` (see package.json "build").
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const dist = new URL('../dist/', import.meta.url).pathname;
const swPath = join(dist, 'sw.js');

// Heavy, route-specific chunks that aren't needed to boot the POS offline — let these be
// runtime-cached on first use instead of bloating the install precache.
const RUNTIME_ONLY = ['exporters', 'charts', 'scanner'];

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push(rel);
  }
  return out;
}

const all = walk(dist);
const assets = all
  .filter((f) => /\.(js|css)$/.test(f) && f.startsWith('assets/'))
  .filter((f) => !RUNTIME_ONLY.some((h) => f.includes(`/${h}`) || f.includes(`assets/${h}`)));

// The precache manifest: the SPA entry + manifest + icons + the critical JS/CSS chunks.
const shell = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  ...assets.map((a) => `/${a}`),
].filter((p, i, arr) => arr.indexOf(p) === i);

// Content hash of the precache set → cache version. A changed build yields a new cache
// name; the SW's activate handler deletes the old one.
const hash = createHash('sha256').update(shell.join('|')).digest('hex').slice(0, 12);

let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'pos-shell-${hash}';`);
sw = sw.replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = ${JSON.stringify(shell)};`);
writeFileSync(swPath, sw);

console.log(`[gen-sw-precache] cache=pos-shell-${hash}, precaching ${shell.length} entries (${assets.length} chunks, runtime-only: ${RUNTIME_ONLY.join('/')})`);

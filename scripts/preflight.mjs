#!/usr/bin/env node
/**
 * Preflight: verify the host DB_PORT is free BEFORE `docker compose up`.
 * If the port is occupied we abort with a clear remediation message so we never
 * collide with another service (a different Postgres, a stale container, etc).
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Lightweight .env loader (avoid a hard dependency for a preflight script).
function loadEnv() {
  const env = {};
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const host = env.DB_HOST || '127.0.0.1';
const port = Number(env.DB_PORT || 5432);

function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true)); // something is listening
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false)); // connection refused => free
    socket.connect(port, host === 'localhost' ? '127.0.0.1' : host);
  });
}

const inUse = await checkPort(host, port);

if (inUse) {
  console.error(`\n\x1b[31m✖ Port ${port} on ${host} is already in use.\x1b[0m`);
  console.error('  The PostgreSQL container cannot bind to a busy port.\n');
  console.error('  Fix options:');
  console.error(`    1. Stop whatever is using port ${port}, OR`);
  console.error('    2. Pick a different host port in your .env, e.g.:');
  console.error('         \x1b[36mDB_PORT=5433\x1b[0m');
  console.error('       and update DATABASE_URL to match (…:5433/…),');
  console.error('       then re-run \x1b[36mnpm run db:up\x1b[0m.\n');
  console.error(`  (Tip: find the listener with: \x1b[36mlsof -iTCP:${port} -sTCP:LISTEN -n -P\x1b[0m)\n`);
  process.exit(1);
}

console.log(`\x1b[32m✓ Port ${port} is free — starting PostgreSQL.\x1b[0m`);
process.exit(0);

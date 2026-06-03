// Assembles the all-in-one Server bundle for the Tauri desktop app:
//   1. builds the web SPA  (Tauri loads it as the UI via frontendDist)
//   2. builds the server   (tsc -> server/dist)
//   3. stages a production server (dist + package.json + prisma + prod node_modules +
//      generated Prisma client) into desktop/src-tauri/resources/server/
//
// `cargo tauri build` then bundles resources/server into the app; the Rust launcher runs
// <resources>/server/dist/src/index.js with system `node` when the user picks the Server role.
// Postgres is NOT bundled — the server connects to the DATABASE_URL set in the setup wizard.
//
// Run: node desktop/scripts/bundle.mjs   (from anywhere; paths are resolved from here)
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const server = join(repo, 'server');
const web = join(repo, 'web');
const stage = join(here, '..', 'src-tauri', 'resources', 'server');

const run = (cmd, cwd) => { console.log(`\n$ ${cmd}  (in ${cwd})`); execSync(cmd, { cwd, stdio: 'inherit' }); };

console.log('• 1/4  build web SPA');
run('npm run build', web);

console.log('• 2/4  build server');
run('npm run build', server);

console.log('• 3/4  stage server files');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const item of ['dist', 'prisma', 'package.json', 'package-lock.json']) {
  const src = join(server, item);
  if (existsSync(src)) cpSync(src, join(stage, item), { recursive: true });
}

console.log('• 4/4  install production deps + generate Prisma client (in the staged bundle)');
run('npm ci --omit=dev', stage);
run('npx prisma generate', stage);

console.log(`\n✓ server bundle staged at ${stage}`);
console.log('  next: cd desktop && npx tauri build   (set DATABASE_URL in the Server setup wizard)');

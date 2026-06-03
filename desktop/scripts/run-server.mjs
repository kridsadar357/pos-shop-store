// Entrypoint for the bundled API server in the desktop Server role. Applies any pending
// Prisma migrations first (so a fresh/updated PostgreSQL gets its tables), then starts the
// API. Run from the bundle root with DATABASE_URL set — the Tauri launcher passes it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

try {
  // Use the bundled Prisma CLI + migrations to bring the DB up to date.
  execFileSync(process.execPath, [join(dir, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: dir,
    stdio: 'inherit',
  });
} catch (e) {
  console.error('[pos-server] prisma migrate deploy failed:', e?.message ?? e);
  process.exit(1);
}

// Start the API (listens on PORT, default 4000).
await import('./dist/src/index.js');

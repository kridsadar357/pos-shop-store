#!/usr/bin/env node
/** Wait for the postgres container's healthcheck to report healthy. */
import { execSync } from 'node:child_process';

const TIMEOUT_MS = 60_000;
const start = Date.now();

process.stdout.write('Waiting for PostgreSQL to become healthy');
while (Date.now() - start < TIMEOUT_MS) {
  let status = '';
  try {
    status = execSync(
      'docker inspect -f "{{.State.Health.Status}}" pos_postgres',
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
  } catch {
    // container not ready yet
  }
  if (status === 'healthy') {
    console.log('\n\x1b[32m✓ PostgreSQL is healthy.\x1b[0m');
    process.exit(0);
  }
  process.stdout.write('.');
  // busy-wait ~1s without async timers (keeps the script trivial)
  const until = Date.now() + 1000;
  while (Date.now() < until) {}
}

console.error('\n\x1b[31m✖ Timed out waiting for PostgreSQL.\x1b[0m Check: docker compose logs postgres');
process.exit(1);

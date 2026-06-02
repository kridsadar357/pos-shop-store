import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './env.js';
import { prisma } from './prisma.js';
import { attachDisplayRelay } from './lib/displayRelay.js';
import { startReportScheduler } from './lib/reportScheduler.js';

const app = createApp();
const server = createServer(app);
attachDisplayRelay(server); // customer second-display WebSocket relay at /ws/display

server.listen(env.PORT, () => {
  console.log(`\x1b[32m✓ POS API listening on http://localhost:${env.PORT}\x1b[0m`);
  console.log(`  Customer display relay: ws://localhost:${env.PORT}/ws/display`);
  startReportScheduler(prisma); // emails the daily sales summary at the configured hour
});

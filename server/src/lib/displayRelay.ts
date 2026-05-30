import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Customer-display relay. The POS (publisher) and any number of customer
 * displays / IoT devices (subscribers) connect to /ws/display. Whatever the
 * POS sends is broadcast to every other client. The last state is cached and
 * replayed to newly connected displays so a screen that powers on mid-sale
 * immediately shows the current cart. Messages are namespaced by an optional
 * `terminal` query param so multiple registers can run independently.
 */
export function attachDisplayRelay(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/display' });
  const lastByTerminal = new Map<string, string>();

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const terminal = url.searchParams.get('terminal') || 'default';
    (socket as WebSocket & { terminal?: string }).terminal = terminal;

    // Replay the most recent state for this terminal.
    const cached = lastByTerminal.get(terminal);
    if (cached) socket.send(cached);

    socket.on('message', (raw) => {
      const data = raw.toString();
      lastByTerminal.set(terminal, data);
      for (const client of wss.clients) {
        const c = client as WebSocket & { terminal?: string };
        if (c !== socket && c.readyState === WebSocket.OPEN && c.terminal === terminal) {
          c.send(data);
        }
      }
    });
  });

  return wss;
}

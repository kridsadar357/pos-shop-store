/**
 * Customer second-display bus. Mirrors the POS state to a customer-facing
 * screen via two transports simultaneously:
 *   1. BroadcastChannel — instant, for a second browser window on an extended
 *      monitor (same machine, same origin, zero network).
 *   2. WebSocket relay (/ws/display) — for IoT / embedded customer displays on
 *      other devices on the network.
 * Subscribers (the /display page) merge both; latest message wins.
 */

export type DisplayStatus = 'IDLE' | 'CART' | 'PAYMENT' | 'PAID';

export interface DisplayItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
}

export interface DisplayState {
  status: DisplayStatus;
  storeName: string;
  currency: string;
  items: DisplayItem[];
  count: number;
  subtotal: number;
  tax: number;
  total: number;
  // Optional secondary-currency display (≈ conversion) so foreign customers see the price.
  secondaryCurrency?: string;
  secondaryRate?: number;
  member?: { name: string } | null;
  isMemberPrice?: boolean;
  qrPayload?: string;
  promptPayId?: string;
  orderNo?: string;
  change?: number;
  cashReceived?: number;
  paymentMethod?: 'CASH' | 'TRANSFER';
  ts: number;
}

const CHANNEL = 'pos-customer-display';
const terminal = localStorage.getItem('pos_terminal') || 'default';

function wsUrl() {
  // Connect straight to the API origin so we never traverse Vite's dev ws-proxy
  // (which logs harmless EPIPE noise when a socket closes mid-write).
  //  - VITE_API_URL set  -> derive ws from it
  //  - dev (no override)  -> backend on :4000 directly
  //  - prod               -> same origin
  let origin: string;
  const apiBase = import.meta.env.VITE_API_URL;
  if (apiBase) origin = apiBase;
  else if (import.meta.env.DEV) origin = `${location.protocol}//${location.hostname}:4000`;
  else origin = location.origin;
  const wsProto = origin.startsWith('https') ? 'wss' : 'ws';
  return `${wsProto}://${origin.replace(/^https?:\/\//, '')}/ws/display?terminal=${encodeURIComponent(terminal)}`;
}

/**
 * Resilient WebSocket with backoff that stops reconnecting once intentionally
 * closed (prevents zombie sockets under React StrictMode double-mount, which is
 * what spams the Vite ws proxy with EPIPE). Returns a handle with send/close.
 */
function resilientWs(onMessage?: (data: string) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending: string[] = [];

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        attempts = 0;
        while (pending.length && ws?.readyState === WebSocket.OPEN) ws.send(pending.shift()!);
      };
      if (onMessage) ws.onmessage = (e) => onMessage(typeof e.data === 'string' ? e.data : '');
      ws.onclose = () => {
        ws = null;
        if (closed) return;
        // exponential backoff capped at 10s
        const delay = Math.min(1000 * 2 ** attempts++, 10000);
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    } catch {
      if (!closed) timer = setTimeout(connect, 2000);
    }
  }
  connect();

  return {
    send(msg: string) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      else {
        pending.length = 0; // only the latest state matters
        pending.push(msg);
      }
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}

/** POS side: returns a publish() that fans state out to both transports. */
export function createPublisher() {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  const sock = resilientWs();

  return {
    publish(state: DisplayState) {
      const msg = JSON.stringify(state);
      bc?.postMessage(msg);
      sock.send(msg);
    },
    close() {
      bc?.close();
      sock.close();
    },
  };
}

/** Display side: subscribe to state from both transports. Returns unsubscribe. */
export function subscribe(cb: (s: DisplayState) => void) {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  const onMsg = (data: string) => {
    try {
      cb(JSON.parse(data));
    } catch {
      /* ignore */
    }
  };
  if (bc) bc.onmessage = (e) => onMsg(typeof e.data === 'string' ? e.data : '');
  const sock = resilientWs(onMsg);

  return () => {
    bc?.close();
    sock.close();
  };
}

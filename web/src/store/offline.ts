import { create } from 'zustand';
import { api } from '../api/client';

// A sale that couldn't reach the server (offline / network drop) and is queued for replay.
// `payload` is the exact POST /sales body, including its `clientRef` idempotency key — so a
// replay that the server already processed returns the original bill instead of duplicating it.
export interface QueuedSale {
  clientRef: string;
  payload: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
  lastError?: string;
  // Cached for the pending-sync UI (the real bill lives server-side once synced).
  total: number;
  itemCount: number;
}

const KEY = 'pos_offline_sales';

function load(): QueuedSale[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function persist(items: QueuedSale[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

/** True when a thrown error is a connectivity failure (offline), not a server rejection. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (e instanceof TypeError) return true; // fetch() rejects with TypeError when the network is unreachable
  const msg = (e as Error)?.message || '';
  return /failed to fetch|networkerror|load failed|connection|fetch/i.test(msg);
}

interface OfflineState {
  items: QueuedSale[];
  syncing: boolean;
  enqueue: (q: QueuedSale) => void;
  remove: (clientRef: string) => void;
  /** Replay queued sales oldest-first. Idempotent via clientRef. Safe to call repeatedly. */
  sync: () => Promise<void>;
}

export const useOffline = create<OfflineState>((set, get) => ({
  items: load(),
  syncing: false,

  enqueue(q) {
    // De-dupe by clientRef (a retried enqueue of the same cart shouldn't double-queue).
    const items = [...get().items.filter((i) => i.clientRef !== q.clientRef), q];
    persist(items);
    set({ items });
  },

  remove(clientRef) {
    const items = get().items.filter((i) => i.clientRef !== clientRef);
    persist(items);
    set({ items });
  },

  async sync() {
    if (get().syncing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = get().items;
    if (!queue.length) return;
    set({ syncing: true });
    try {
      for (const item of queue) {
        try {
          await api('/sales', { method: 'POST', body: item.payload });
          get().remove(item.clientRef); // created now, or already existed (idempotent) — either way it's synced
        } catch (e) {
          if (isNetworkError(e)) break; // still offline — stop and retry on the next trigger
          // Server rejected this sale (a business error, e.g. an invalid gift card). It won't
          // succeed on retry — flag it so the cashier can see/discard it, and move on.
          const items = get().items.map((i) =>
            i.clientRef === item.clientRef ? { ...i, attempts: i.attempts + 1, lastError: (e as Error).message } : i
          );
          persist(items);
          set({ items });
        }
      }
    } finally {
      set({ syncing: false });
    }
  },
}));

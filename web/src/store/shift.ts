import { create } from 'zustand';
import { api } from '../api/client';
import { useBranch } from './branch';
import { isNetworkError } from './offline';
import type { Shift } from '../types';

// The open shift is cached so the POS still shows the register (not the open-shift gate)
// after a cold reload while offline. Server stays authoritative — it re-attributes synced
// sales to whatever shift is open server-side at replay time.
const STORE_KEY = 'pos_shift';
function persistShift(s: Shift | null) {
  if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORE_KEY);
}

interface ShiftState {
  current: Shift | null;
  loading: boolean;
  refresh: () => Promise<void>;
  open: (openingFloat: number) => Promise<void>;
  close: (countedCash: number, note: string) => Promise<Shift>;
  cashInOut: (type: 'PAY_IN' | 'PAY_OUT', amount: number, reason: string) => Promise<void>;
}

export const useShift = create<ShiftState>((set, get) => ({
  current: JSON.parse(localStorage.getItem(STORE_KEY) || 'null'),
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const s = await api<Shift | null>('/shifts/current');
      set({ current: s });
      persistShift(s);
    } catch (e) {
      // Offline: keep the cached shift so the register stays open. Only a real
      // (online) response clears it.
      if (!isNetworkError(e)) { set({ current: null }); persistShift(null); }
    } finally {
      set({ loading: false });
    }
  },
  async open(openingFloat) {
    const branchId = useBranch.getState().activeId ?? undefined;
    await api('/shifts/open', { method: 'POST', body: { openingFloat, branchId } });
    await get().refresh();
  },
  async close(countedCash, note) {
    const cur = get().current;
    if (!cur) throw new Error('No open shift');
    const closed = await api<Shift>(`/shifts/${cur.id}/close`, { method: 'POST', body: { countedCash, note } });
    set({ current: null });
    persistShift(null);
    return closed;
  },
  async cashInOut(type, amount, reason) {
    const cur = get().current;
    if (!cur) throw new Error('No open shift');
    await api(`/shifts/${cur.id}/cash`, { method: 'POST', body: { type, amount, reason } });
    await get().refresh();
  },
}));

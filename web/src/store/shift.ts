import { create } from 'zustand';
import { api } from '../api/client';
import { useBranch } from './branch';
import type { Shift } from '../types';

interface ShiftState {
  current: Shift | null;
  loading: boolean;
  refresh: () => Promise<void>;
  open: (openingFloat: number) => Promise<void>;
  close: (countedCash: number, note: string) => Promise<Shift>;
}

export const useShift = create<ShiftState>((set, get) => ({
  current: null,
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const s = await api<Shift | null>('/shifts/current');
      set({ current: s });
    } catch {
      set({ current: null });
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
    return closed;
  },
}));

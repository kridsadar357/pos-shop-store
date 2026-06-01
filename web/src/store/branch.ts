import { create } from 'zustand';
import { api } from '../api/client';

export interface Branch {
  id: number;
  code: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  isDefault: boolean;
  // Per-branch overrides (empty = inherit global Setting)
  promptPayId?: string;
  promptPayType?: string;
  printerType?: string;
  printerAddress?: string;
  printerPaper?: string;
  receiptHeader?: string;
  receiptFooter?: string;
}

interface BranchState {
  branches: Branch[];
  activeId: number | null;
  load: () => Promise<void>;
  setActive: (id: number) => void;
  active: () => Branch | null;
}

const stored = Number(localStorage.getItem('pos_branch')) || null;

export const useBranch = create<BranchState>((set, get) => ({
  branches: [],
  activeId: stored,
  async load() {
    try {
      const bs = await api<Branch[]>('/branches', { query: { active: 1 } });
      set({ branches: bs });
      if (!get().activeId || !bs.some((b) => b.id === get().activeId)) {
        const def = bs.find((b) => b.isDefault) ?? bs[0];
        if (def) { set({ activeId: def.id }); localStorage.setItem('pos_branch', String(def.id)); }
      }
    } catch { /* not signed in / no branches yet */ }
  },
  setActive(id) {
    set({ activeId: id });
    localStorage.setItem('pos_branch', String(id));
  },
  active() {
    const { branches, activeId } = get();
    return branches.find((b) => b.id === activeId) ?? branches.find((b) => b.isDefault) ?? branches[0] ?? null;
  },
}));

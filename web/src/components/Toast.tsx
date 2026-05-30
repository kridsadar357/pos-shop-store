import { create } from 'zustand';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}
interface ToastState {
  items: ToastItem[];
  push: (kind: Kind, message: string) => void;
  remove: (id: number) => void;
}

let seq = 1;
export const useToast = create<ToastState>((set) => ({
  items: [],
  push(kind, message) {
    const id = seq++;
    set((s) => ({ items: [...s.items, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3200);
  },
  remove(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error: (m: string) => useToast.getState().push('error', m),
  info: (m: string) => useToast.getState().push('info', m),
};

export function ToastHost() {
  const { items, remove } = useToast();
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-white shadow-card ${
            t.kind === 'success' ? 'bg-emerald-600' : t.kind === 'error' ? 'bg-rose-600' : 'bg-ink-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

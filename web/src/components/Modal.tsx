import type { ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

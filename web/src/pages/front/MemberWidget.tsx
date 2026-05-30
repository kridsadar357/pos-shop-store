import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { th } from '../../lib/th';
import type { Member } from '../../types';

export function MemberWidget({
  member,
  onChange,
}: {
  member: Member | null;
  onChange: (m: Member | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (member) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-brand-50 p-2 ring-1 ring-brand-200">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {member.name.charAt(0)}
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-brand-900">{member.name}</div>
            <div className="text-[11px] text-brand-600">{member.phone} · {th.memberPrice}</div>
          </div>
        </div>
        <button className="text-[11px] font-semibold text-rose-600" onClick={() => onChange(null)}>{th.remove}</button>
      </div>
    );
  }

  return (
    <>
      <button
        className="flex w-full items-center gap-2 rounded-xl bg-slate-50 p-2 text-left text-[13px] font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
        onClick={() => setOpen(true)}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-sm">👤</span>
        {th.selectMember} <span className="ml-auto text-[11px] font-normal text-slate-400">{th.noMember}</span>
      </button>
      {open && <MemberPicker onPick={(m) => { onChange(m); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MemberPicker({ onPick, onClose }: { onPick: (m: Member) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });

  useEffect(() => {
    const t = setTimeout(() => api<Member[]>('/members', { query: { q } }).then(setResults).catch(() => {}), 160);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    try {
      const m = await api<Member>('/members', { method: 'POST', body: { ...form, email: '', note: '' } });
      toast.success(th.addMember);
      onPick(m);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Modal title={th.selectMember} onClose={onClose}>
      {!creating ? (
        <>
          <input
            data-scan="true"
            className="input"
            placeholder={th.searchMember}
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3 max-h-72 space-y-1 overflow-auto">
            {results.map((m) => (
              <button
                key={m.id}
                onClick={() => onPick(m)}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-slate-50"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{m.name.charAt(0)}</div>
                <div>
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="text-xs text-slate-400">{m.phone}{m.code ? ` · ${m.code}` : ''}</div>
                </div>
              </button>
            ))}
            {results.length === 0 && <div className="py-6 text-center text-sm text-slate-400">{th.noMember}</div>}
          </div>
          <button className="btn-ghost mt-3 w-full" onClick={() => { setForm({ name: q, phone: '' }); setCreating(true); }}>
            + {th.addMember}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">{th.memberName}</label>
            <input className="input" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">{th.phone}</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setCreating(false)}>{th.cancel}</button>
            <button className="btn-primary flex-1" disabled={!form.name || !form.phone} onClick={create}>{th.save}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

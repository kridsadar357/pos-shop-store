import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { GiftCard, GiftCardTxn } from '../../types';

const TXN_LABEL: Record<GiftCardTxn['type'], string> = { ISSUE: 'ออกบัตร', RELOAD: 'เติมเงิน', REDEEM: 'ใช้จ่าย', REFUND: 'คืนเงิน' };

export default function GiftCards() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [issue, setIssue] = useState(false);
  const [history, setHistory] = useState<GiftCard | null>(null);

  async function load() { setCards(await api<GiftCard[]>('/gift-cards', { query: q ? { q } : {} })); }
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [q]);

  const filtered = useMemo(() => cards.filter((c) => {
    if (status === 'active' && (!c.isActive || num(c.balance) <= 0)) return false;
    if (status === 'empty' && num(c.balance) > 0) return false;
    if (status === 'disabled' && c.isActive) return false;
    return true;
  }), [cards, status]);

  const totalOutstanding = useMemo(() => cards.filter((c) => c.isActive).reduce((s, c) => s + num(c.balance), 0), [cards]);

  async function toggle(c: GiftCard) {
    await api(`/gift-cards/${c.id}`, { method: 'PUT', body: { isActive: !c.isActive } });
    load();
  }

  const columns: Column<GiftCard>[] = [
    { label: 'รหัสบัตร', value: (c) => c.code },
    { label: 'มูลค่าเริ่มต้น', value: (c) => num(c.initialBalance), right: true },
    { label: 'คงเหลือ', value: (c) => num(c.balance), right: true },
    { label: 'สถานะ', value: (c) => (c.isActive ? 'ใช้งาน' : 'ระงับ') },
    { label: 'หมายเหตุ', value: (c) => c.note },
    { label: 'ออกเมื่อ', value: (c) => dateTime(c.createdAt) },
  ];
  const exporters = makeExporters({ filename: 'gift-cards', title: 'บัตรของขวัญ', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="บัตรของขวัญ"
        subtitle="ออกบัตร เติมเงิน และติดตามยอดคงเหลือ — ใช้ชำระที่หน้าขายได้"
        icon={<i className="fa-solid fa-gift" />}
        q={q} setQ={setQ} placeholder="ค้นหารหัสบัตร / หมายเหตุ…"
        primary={<button className="btn-primary" onClick={() => setIssue(true)}><i className="fa-solid fa-plus mr-1.5" />ออกบัตรใหม่</button>}
        exports={exporters}
        filterCount={status ? 1 : 0}
        onResetFilter={() => setStatus('')}
        filter={
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="active">มียอดคงเหลือ</option>
              <option value="empty">ยอดหมด</option>
              <option value="disabled">ถูกระงับ</option>
            </select>
          </div>
        }
      />

      <div className="card flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-slate-400">ภาระคงค้าง (ยอดในบัตรที่ใช้งานอยู่)</span>
        <span className="text-2xl font-extrabold text-violet-600">{money(totalOutstanding)}</span>
      </div>

      <DataTable
        rows={filtered}
        colCount={7}
        empty="ยังไม่มีบัตรของขวัญ"
        head={<tr><th className="px-4 py-3">รหัสบัตร</th><th className="px-4 py-3 text-right">มูลค่าเริ่มต้น</th><th className="px-4 py-3 text-right">คงเหลือ</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">หมายเหตุ</th><th /></tr>}
        renderRow={(c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
            <td className="px-4 py-3 text-right">{money(c.initialBalance)}</td>
            <td className="px-4 py-3 text-right font-bold text-violet-600">{money(c.balance)}</td>
            <td className="px-4 py-3"><span className={`chip ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{c.isActive ? 'ใช้งาน' : 'ระงับ'}</span></td>
            <td className="px-4 py-3 text-slate-500">{c.note || '—'}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-brand-600" onClick={() => setHistory(c)}>เติม/ประวัติ</button>
              <button className="ml-3 text-sm font-semibold text-slate-500" onClick={() => toggle(c)}>{c.isActive ? 'ระงับ' : 'เปิด'}</button>
            </td>
          </tr>
        )}
      />

      {issue && <IssueModal onClose={() => setIssue(false)} onDone={load} />}
      {history && <CardModal card={history} onClose={() => setHistory(null)} onChanged={load} />}
    </div>
  );
}

function IssueModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (amount <= 0) return toast.error('กรอกมูลค่าบัตร');
    setBusy(true);
    try {
      const body: Record<string, unknown> = { amount, note: note.trim() };
      if (code.trim()) body.code = code.trim();
      const card = await api<GiftCard>('/gift-cards', { method: 'POST', body });
      toast.success(`ออกบัตร ${card.code} แล้ว`);
      onDone();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="ออกบัตรของขวัญใหม่" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">มูลค่าบัตร (฿)</label><input type="number" className="input text-lg" value={amount || ''} autoFocus onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
          <div className="mt-2 flex flex-wrap gap-2">{[100, 300, 500, 1000].map((v) => <button key={v} className="btn-ghost" onClick={() => setAmount(v)}>{money(v)}</button>)}</div>
        </div>
        <div><label className="label">รหัสบัตร (เว้นว่าง = สร้างอัตโนมัติ)</label><input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="auto" /></div>
        <div><label className="label">หมายเหตุ</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={onClose}>ยกเลิก</button><button className="btn-primary flex-1" disabled={busy || amount <= 0} onClick={submit}>ออกบัตร</button></div>
    </Modal>
  );
}

function CardModal({ card, onClose, onChanged }: { card: GiftCard; onClose: () => void; onChanged: () => void }) {
  const [txns, setTxns] = useState<GiftCardTxn[]>([]);
  const [balance, setBalance] = useState(num(card.balance));
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    const t = await api<GiftCardTxn[]>(`/gift-cards/${card.id}/txns`).catch(() => []);
    setTxns(t);
    setBalance(t[0] ? num(t[0].balance) : num(card.balance));
  }
  useEffect(() => { load(); }, [card.id]);

  async function doReload() {
    if (reload <= 0) return toast.error('กรอกจำนวนเงินที่จะเติม');
    setBusy(true);
    try {
      await api(`/gift-cards/${card.id}/reload`, { method: 'POST', body: { amount: reload } });
      toast.success('เติมเงินแล้ว');
      setReload(0);
      await load();
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`บัตร ${card.code}`} onClose={onClose}>
      <div className="flex items-center justify-between rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
        <span className="text-sm font-semibold text-violet-700"><i className="fa-solid fa-gift mr-1.5" />ยอดคงเหลือ</span>
        <span className="text-2xl font-extrabold text-violet-600">{money(balance)}</span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1"><label className="label">เติมเงินเข้าบัตร (฿)</label><input type="number" className="input" value={reload || ''} onChange={(e) => setReload(Math.max(0, Number(e.target.value)))} /></div>
        <button className="btn-primary" disabled={busy || reload <= 0} onClick={doReload}>เติมเงิน</button>
      </div>

      <div className="mt-4 max-h-56 overflow-auto rounded-xl ring-1 ring-slate-100">
        {txns.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีประวัติ</p> : txns.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-sm last:border-0">
            <span><span className="font-semibold">{TXN_LABEL[t.type]}</span> <span className="text-[11px] text-slate-400">{dateTime(t.createdAt)}{t.note ? ` · ${t.note}` : ''}</span></span>
            <span className={`font-bold ${num(t.amount) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{num(t.amount) >= 0 ? '+' : ''}{money(t.amount)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

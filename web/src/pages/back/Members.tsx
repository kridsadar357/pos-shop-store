import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { toast } from '../../components/Toast';
import type { Member, PointTransaction } from '../../types';

const empty = { code: '', name: '', phone: '', email: '', note: '', isActive: true };
type Form = typeof empty;

export default function Members() {
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pointsFor, setPointsFor] = useState<Member | null>(null);

  async function load() {
    setMembers(await api<Member[]>('/members', { query: { q } }));
  }
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q]);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
  }
  function openEdit(m: Member) {
    setEditing(m);
    setForm({ code: m.code ?? '', name: m.name, phone: m.phone, email: m.email, note: m.note, isActive: m.isActive });
  }

  async function save() {
    if (!form) return;
    try {
      const body = { ...form, code: form.code || null };
      if (editing) await api(`/members/${editing.id}`, { method: 'PUT', body });
      else await api('/members', { method: 'POST', body });
      toast.success('บันทึกแล้ว');
      setForm(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const filtered = useMemo(() => members.filter((m) => {
    if (statusFilter === 'active' && !m.isActive) return false;
    if (statusFilter === 'inactive' && m.isActive) return false;
    if (emailFilter === 'with' && !m.email) return false;
    if (emailFilter === 'without' && m.email) return false;
    return true;
  }), [members, statusFilter, emailFilter]);

  const filterCount = [statusFilter, emailFilter].filter(Boolean).length;

  const columns: Column<Member>[] = [
    { label: 'รหัส', value: (m) => m.code ?? '' },
    { label: 'ชื่อ', value: (m) => m.name },
    { label: 'เบอร์โทร', value: (m) => m.phone },
    { label: 'อีเมล', value: (m) => m.email || '' },
    { label: 'หมายเหตุ', value: (m) => m.note || '' },
    { label: 'แต้มสะสม', value: (m) => m.points ?? 0, right: true },
    { label: 'สถานะ', value: (m) => (m.isActive ? 'ใช้งาน' : 'ปิดใช้งาน') },
  ];
  const exporters = makeExporters({ filename: 'members', title: 'รายชื่อลูกค้า / สมาชิก', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ลูกค้า / สมาชิก"
        subtitle="สมาชิกสะสมแต้ม · มีสิทธิ์ได้ราคาส่ง (ตั้งค่าได้ในหน้าตั้งค่า)"
        icon={<i className="fa-solid fa-users" />}
        q={q} setQ={setQ} placeholder="ค้นหาชื่อ / เบอร์โทร / รหัส…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />เพิ่มสมาชิก</button>}
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setStatusFilter(''); setEmailFilter(''); }}
        filter={
          <>
            <div>
              <label className="label">สถานะ</label>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="active">ใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </select>
            </div>
            <div>
              <label className="label">อีเมล</label>
              <select className="input" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="with">มีอีเมล</option>
                <option value="without">ไม่มีอีเมล</option>
              </select>
            </div>
          </>
        }
      />

      <DataTable
        rows={filtered}
        colCount={7}
        empty="ยังไม่มีสมาชิก"
        head={<tr><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">เบอร์โทร</th><th className="px-4 py-3">อีเมล</th><th className="px-4 py-3 text-right">แต้มสะสม</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(m) => (
          <tr key={m.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.code ?? '—'}</td>
            <td className="px-4 py-3 font-semibold">{m.name}</td>
            <td className="px-4 py-3">{m.phone}</td>
            <td className="px-4 py-3 text-slate-500">{m.email || '—'}</td>
            <td className="px-4 py-3 text-right"><span className="chip bg-amber-50 font-bold text-amber-700">{(m.points ?? 0).toLocaleString()} แต้ม</span></td>
            <td className="px-4 py-3"><span className={`chip ${m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-amber-600" onClick={() => setPointsFor(m)}>แต้ม</button>
              <button className="ml-3 text-sm font-semibold text-brand-600" onClick={() => openEdit(m)}>แก้ไข</button>
            </td>
          </tr>
        )}
      />

      {form && (
        <Modal title={editing ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">รหัสสมาชิก</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            </div>
            <div><label className="label">อีเมล</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">หมายเหตุ</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            {editing && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> ใช้งาน</label>
            )}
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={!form.name || !form.phone} onClick={save}>บันทึก</button></div>
        </Modal>
      )}

      {pointsFor && (
        <PointsModal member={pointsFor} onClose={() => setPointsFor(null)} onChanged={load} />
      )}
    </div>
  );
}

const PT_LABEL: Record<PointTransaction['type'], string> = { EARN: 'ได้รับ', REDEEM: 'ใช้แต้ม', ADJUST: 'ปรับแต้ม' };

/** Points balance + ledger history + manual adjustment for one member. */
function PointsModal({ member, onClose, onChanged }: { member: Member; onClose: () => void; onChanged: () => void }) {
  const [txns, setTxns] = useState<PointTransaction[]>([]);
  const [balance, setBalance] = useState(member.points ?? 0);
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const t = await api<PointTransaction[]>(`/members/${member.id}/points`);
    setTxns(t);
    setBalance(t[0]?.balance ?? member.points ?? 0);
  }
  useEffect(() => { load(); }, [member.id]);

  async function adjust() {
    if (delta === 0) return toast.error('กรอกจำนวนแต้มที่ต้องการปรับ');
    setBusy(true);
    try {
      await api(`/members/${member.id}/points`, { method: 'POST', body: { points: delta, note: note.trim() } });
      toast.success('ปรับแต้มแล้ว');
      setDelta(0); setNote('');
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`แต้มสะสม · ${member.name}`} onClose={onClose}>
      <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <span className="text-sm font-semibold text-amber-700"><i className="fa-solid fa-star mr-1.5" /> แต้มคงเหลือ</span>
        <span className="text-2xl font-extrabold text-amber-600">{balance.toLocaleString()} แต้ม</span>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-500">ปรับแต้มด้วยตนเอง (ใส่ค่าลบเพื่อหักแต้ม)</div>
        <div className="mt-2 flex gap-2">
          <input type="number" className="input w-28" placeholder="+/− แต้ม" value={delta || ''} onChange={(e) => setDelta(Math.floor(Number(e.target.value)) || 0)} />
          <input className="input flex-1" placeholder="หมายเหตุ (เช่น ของขวัญ, แก้ไขข้อผิดพลาด)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={busy || delta === 0} onClick={adjust}>บันทึก</button>
        </div>
      </div>

      <div className="mt-4 max-h-64 overflow-auto rounded-xl ring-1 ring-slate-100">
        {txns.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติแต้ม</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{PT_LABEL[t.type]}{t.sale ? ` · ${t.sale.orderNo}` : ''}</div>
                    <div className="text-[11px] text-slate-400">{new Date(t.createdAt).toLocaleString('th-TH')}{t.note ? ` · ${t.note}` : ''}</div>
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${t.points >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{t.points >= 0 ? '+' : ''}{t.points}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-400">{t.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

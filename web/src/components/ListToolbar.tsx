import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ExportHandlers {
  excel?: () => void;
  csv?: () => void;
  pdf?: () => void;
  zip?: () => void;
}

/**
 * Shared list-page header + toolbar on a single line: the page title/subtitle on
 * the left, and the controls (date range, search, advanced-filter popover, export
 * menu, primary action) pushed to the right.
 */
export function ListToolbar({
  title,
  subtitle,
  icon,
  q,
  setQ,
  placeholder = 'ค้นหา…',
  dateRange,
  primary,
  exports,
  filter,
  filterCount = 0,
  onResetFilter,
}: {
  title?: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  q?: string;
  setQ?: (v: string) => void;
  placeholder?: string;
  /** rendered before the search box (e.g. a date-range picker) */
  dateRange?: ReactNode;
  primary?: ReactNode;
  exports?: ExportHandlers;
  /** advanced-filter form rendered inside the popover */
  filter?: ReactNode;
  /** number of active filters (shows a badge) */
  filterCount?: number;
  onResetFilter?: () => void;
}) {
  const hasExports = exports && Object.values(exports).some(Boolean);

  const controls = (
    <>
      {dateRange}
      {setQ && (
        <div className="relative w-full sm:w-56 lg:w-64">
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
          <input className="input pl-9" placeholder={placeholder} value={q ?? ''} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {filter && (
        <FilterPopover count={filterCount} onReset={onResetFilter}>
          {filter}
        </FilterPopover>
      )}
      {hasExports && <ExportMenu exports={exports!} />}
      {primary}
    </>
  );

  // Without a title, render just the toolbar row (legacy callers / sub-sections).
  if (!title) return <div className="flex flex-wrap items-center gap-2">{controls}</div>;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-600 ring-1 ring-brand-100">{icon}</div>}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{controls}</div>
    </div>
  );
}

function FilterPopover({ children, count, onReset }: { children: ReactNode; count: number; onReset?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold ring-1 transition ${
          count ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        }`}
      >
        <i className="fa-solid fa-sliders" /> ตัวกรอง
        {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[340px] rounded-2xl bg-white p-4 shadow-pop ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-ink-900">ตัวกรองขั้นสูง</span>
            {onReset && <button className="text-xs font-semibold text-rose-500 hover:underline" onClick={onReset}>ล้างตัวกรอง</button>}
          </div>
          <div className="space-y-3">{children}</div>
          <button className="btn-primary mt-4 w-full" onClick={() => setOpen(false)}>ใช้ตัวกรอง</button>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ exports }: { exports: ExportHandlers }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const item = (icon: string, label: string, color: string, fn?: () => void) =>
    fn ? (
      <button
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium hover:bg-slate-50"
        onClick={() => { setOpen(false); fn(); }}
      >
        <i className={`${icon} w-4 ${color}`} /> {label}
      </button>
    ) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <i className="fa-solid fa-file-export" /> ส่งออก <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200">
          {item('fa-solid fa-file-excel', 'Excel (.xlsx)', 'text-emerald-600', exports.excel)}
          {item('fa-solid fa-file-pdf', 'PDF', 'text-rose-600', exports.pdf)}
          {item('fa-solid fa-file-csv', 'CSV', 'text-sky-600', exports.csv)}
          {item('fa-solid fa-file-zipper', 'รูปภาพ + CSV (.zip)', 'text-amber-600', exports.zip)}
        </div>
      )}
    </div>
  );
}

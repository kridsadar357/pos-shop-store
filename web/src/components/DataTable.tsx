import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { th } from '../lib/th';

/**
 * Admin data table that FILLS its container height: it measures the available
 * area and shows exactly as many rows as fit (no empty space, no vertical
 * scroll), with static pagination pinned at the footer.
 *
 * The page must give it a bounded height — render it as a `flex-1` child inside
 * a full-height flex column (the back-office list pages do: `flex h-full flex-col`).
 */
export function DataTable<T>({
  head,
  rows,
  renderRow,
  colCount,
  empty = th.tbNoData,
  rowPx = 49,
}: {
  head: ReactNode;
  rows: T[];
  renderRow: (row: T, index: number) => ReactNode;
  colCount: number;
  empty?: string;
  rowPx?: number;
  /** @deprecated no longer used — height is measured from the container */
  reserve?: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(8);
  const [page, setPage] = useState(1);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight - 40; // subtract the thead height
      const fit = Math.floor(h / rowPx);
      if (fit > 0) setPerPage(fit);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowPx]);

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  const start = (page - 1) * perPage;
  const slice = rows.slice(start, start + perPage);

  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">{head}</thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r, i) => renderRow(r, start + i))}
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-400">
          {rows.length === 0 ? '0' : `${start + 1}–${Math.min(start + perPage, rows.length)}`} / {rows.length} รายการ
        </span>
        <div className="flex items-center gap-1">
          <Pg disabled={page <= 1} onClick={() => setPage(1)}><i className="fa-solid fa-angles-left" /></Pg>
          <Pg disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><i className="fa-solid fa-angle-left" /></Pg>
          <span className="px-2 text-xs font-semibold text-slate-600">หน้า {page} / {totalPages}</span>
          <Pg disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><i className="fa-solid fa-angle-right" /></Pg>
          <Pg disabled={page >= totalPages} onClick={() => setPage(totalPages)}><i className="fa-solid fa-angles-right" /></Pg>
        </div>
      </div>
    </div>
  );
}

function Pg({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-lg text-xs text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-30">
      {children}
    </button>
  );
}

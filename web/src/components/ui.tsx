import type { ReactNode } from 'react';

/** Consistent page header used across back-store pages. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-600 ring-1 ring-brand-100">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Enterprise KPI stat card with optional delta + sparkline-ready footer. */
export function StatCard({
  label,
  value,
  icon,
  delta,
  hint,
  accent = 'text-ink-900',
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  delta?: number | null;
  hint?: string;
  accent?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="card p-5 transition hover:shadow-pop">
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        {icon && <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-base text-slate-500 ring-1 ring-slate-100">{icon}</div>}
      </div>
      <div className={`mt-2.5 text-2xl font-extrabold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {delta != null && (
          <span className={`chip ${up ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-600'}`}>
            {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
    </div>
  );
}

/** Friendly empty state for tables and lists. */
export function EmptyState({ icon = '∅', title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl text-slate-400">{icon}</div>
      <p className="mt-3 font-semibold text-slate-500">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

import { getLang, setLang } from '../lib/th';

// ไทย / EN switch. setLang persists the choice and reloads so the active dictionary applies.
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = getLang();
  const btn = (active: boolean) =>
    `px-2.5 py-1 transition ${active ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`;
  return (
    <div className={`inline-flex overflow-hidden rounded-full text-xs font-bold ring-1 ring-slate-300 ${className}`}>
      <button type="button" onClick={() => lang !== 'th' && setLang('th')} className={btn(lang === 'th')}>ไทย</button>
      <button type="button" onClick={() => lang !== 'en' && setLang('en')} className={btn(lang === 'en')}>EN</button>
    </div>
  );
}

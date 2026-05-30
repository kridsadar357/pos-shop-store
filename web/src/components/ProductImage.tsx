import { useState } from 'react';

/** Product image with a graceful gradient+initial fallback when missing/broken. */
export function ProductImage({ src, name, className = '' }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt={name} loading="lazy" className={`object-cover ${className}`} onError={() => setBroken(true)} />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={`grid place-items-center bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 ${className}`}>
      <span className="text-2xl font-extrabold">{initial}</span>
    </div>
  );
}

import { useState } from 'react';
import logoManifest from '../data/psxLogos.json';

const PUBLIC = process.env.PUBLIC_URL || '';

function initials(symbol) {
  const s = String(symbol || '').replace(/[^A-Z0-9]/gi, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}

export function logoUrlForSymbol(symbol) {
  const path = logoManifest[symbol];
  if (!path) return null;
  return `${PUBLIC}${path}`;
}

export default function CompanyLogo({ symbol, name, className = 'w-8 h-8' }) {
  const [failed, setFailed] = useState(false);
  const src = logoUrlForSymbol(symbol);

  if (!src || failed) {
    return (
      <span
        className={`${className} rounded-full bg-[#1E3A8A] text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0`}
        aria-hidden
      >
        {initials(symbol)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} rounded-full object-cover bg-white border border-slate-200 shrink-0`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

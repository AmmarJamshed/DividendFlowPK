import { useState, useMemo } from 'react';
import logoManifest from '../data/psxLogos.json';

const PUBLIC = process.env.PUBLIC_URL || '';

/** Strip PSX futures / preferred suffixes so JVDC-JUL → JVDC, BOP-MARB → BOP */
export function baseSymbol(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  if (!s) return '';
  const stripped = s.replace(
    /-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MARB|APRB|JUNB|SEPB|DECB|R\d+|PS|CPS)$/i,
    ''
  );
  return stripped || s;
}

function initials(symbol) {
  const s = baseSymbol(symbol).replace(/[^A-Z0-9]/gi, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}

export function logoUrlForSymbol(symbol) {
  const raw = String(symbol || '').toUpperCase().trim();
  const base = baseSymbol(raw);
  const path = logoManifest[raw] || logoManifest[base];
  if (!path) return null;
  // Encode path segments so odd symbols still resolve on static hosts
  const encoded = path
    .split('/')
    .map((part) => (part ? encodeURIComponent(part) : ''))
    .join('/');
  return `${PUBLIC}${encoded}`;
}

export default function CompanyLogo({ symbol, name, className = 'w-8 h-8', rounded = 'rounded-full' }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => logoUrlForSymbol(symbol), [symbol]);

  if (!src || failed) {
    return (
      <span
        className={`${className} ${rounded} bg-[#1E3A8A] text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0`}
        title={name || symbol}
        aria-hidden
      >
        {initials(symbol)}
      </span>
    );
  }

  return (
    <span
      className={`${className} ${rounded} bg-white border border-slate-200 shrink-0 overflow-hidden inline-flex items-center justify-center`}
      title={name || symbol}
    >
      <img
        src={src}
        alt={name || symbol || ''}
        className="w-full h-full object-contain p-0.5"
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

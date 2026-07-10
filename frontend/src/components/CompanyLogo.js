import { useState, useMemo } from 'react';
import logoManifest from '../data/psxLogos.json';

const PUBLIC = process.env.PUBLIC_URL || '';

/** Known ticker renames / corporate actions where the logo lives under another symbol */
const LOGO_ALIASES = {
  ENGRO: 'ENGROH',
  GCWLR: 'GCWL',
};

/** Strip PSX futures / preferred / rights suffixes so JVDC-JUL → JVDC, BOP-MARB → BOP */
export function baseSymbol(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  if (!s) return '';
  const stripped = s.replace(
    /-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MARB|APRB|JUNB|SEPB|DECB|JULB|R\d+|PS|CPS)$/i,
    ''
  );
  return stripped || s;
}

/**
 * Candidate symbols to look up in the logo manifest (most specific first).
 * Handles futures (-JUL), rights (GCWLR), preferred (EPCLPS), and renames (ENGRO→ENGROH).
 */
export function logoLookupCandidates(symbol) {
  const raw = String(symbol || '').toUpperCase().trim();
  if (!raw) return [];

  const out = [];
  const push = (v) => {
    if (v && !out.includes(v)) out.push(v);
  };

  push(raw);
  push(LOGO_ALIASES[raw]);

  const base = baseSymbol(raw);
  push(base);
  push(LOGO_ALIASES[base]);

  // Rights / bonus without hyphen: GCWLR → GCWL, TCORPR2 → TCORP
  if (/R\d*$/i.test(raw) && !raw.includes('-')) {
    push(raw.replace(/R\d*$/i, ''));
  }
  // Preferred / convertible without hyphen: EPCLPS, ASLCPS, POWERPS, CLCPS
  if (/(PS|CPS)$/i.test(raw) && !raw.includes('-')) {
    push(raw.replace(/(PS|CPS)$/i, ''));
  }
  // ETF / fund leftovers already covered by exact match when present

  return out.filter(Boolean);
}

function initials(symbol) {
  const s = baseSymbol(symbol).replace(/[^A-Z0-9]/gi, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}

export function logoUrlForSymbol(symbol) {
  for (const key of logoLookupCandidates(symbol)) {
    const logoPath = logoManifest[key];
    if (!logoPath) continue;
    const encoded = logoPath
      .split('/')
      .map((part) => (part ? encodeURIComponent(part) : ''))
      .join('/');
    return `${PUBLIC}${encoded}`;
  }
  return null;
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

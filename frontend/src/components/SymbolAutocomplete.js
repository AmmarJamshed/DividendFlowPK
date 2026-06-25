import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable symbol field — shows "SYMBOL — Company Name" in dropdown (datalist cannot).
 */
export default function SymbolAutocomplete({ value, onChange, options = [], placeholder = 'HBL' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = String(value || '').trim().toUpperCase();
    let list = options;
    if (q) {
      list = options.filter((o) => {
        const sym = o.symbol || '';
        const name = String(o.companyName || '').toUpperCase();
        return sym.includes(q) || name.includes(q);
      });
    }
    return list.slice(0, 14);
  }, [options, value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (opt) => {
    onChange(opt.symbol);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-ice-500/30 focus:border-ink focus:outline-none uppercase font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
          role="listbox"
        >
          {filtered.map((opt) => (
            <li key={opt.symbol} role="option">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                className="w-full text-left px-3 py-2 hover:bg-ice-50 text-sm"
              >
                <span className="font-bold text-slate-800">{opt.symbol}</span>
                {opt.companyName ? (
                  <span className="text-slate-600 font-normal"> — {opt.companyName}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { stockPath } from '../config/exchanges';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) {
      setResults([]);
      return undefined;
    }
    timerRef.current = setTimeout(() => {
      setLoading(true);
      api
        .searchSecurities(q.trim())
        .then((res) => setResults(res.data.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q]);

  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(r) {
    setOpen(false);
    setQ('');
    nav(stockPath(r.exchange, r.symbol));
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-[11rem] sm:max-w-xs">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search ticker…"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ice-400/60"
        aria-label="Search PSX stocks"
      />
      {open && q.trim() && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm">
          {loading && <li className="px-3 py-2 text-slate-500">Searching…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-slate-500">No matches</li>
          )}
          {results.map((r) => (
            <li key={`${r.exchange}-${r.symbol}`}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-ice-50 flex justify-between gap-2"
              >
                <span>
                  <strong>{r.symbol}</strong>
                  <span className="text-slate-500 ml-1 truncate">{r.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
    <div ref={wrapRef} className="relative w-full">
      <label className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search ticker or company…"
          className="w-full rounded-full border-0 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70"
          aria-label="Search ticker or company"
        />
      </label>
      {open && q.trim() && (
        <ul className="absolute z-50 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg text-sm">
          {loading && <li className="px-3 py-2 text-slate-500">Searching…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-slate-500">No matches</li>
          )}
          {results.map((r) => (
            <li key={`${r.exchange}-${r.symbol}`}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 flex justify-between gap-2"
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

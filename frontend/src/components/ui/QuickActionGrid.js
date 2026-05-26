import { Link } from 'react-router-dom';

const ICONS = {
  chart: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 19h16" />
      <path d="M7 16V9M12 16V6M17 16v-4" />
    </svg>
  ),
  calc: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 8.5h18v11H3z" />
      <path d="M16 12.5h3" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5h16v11H8l-4 4z" />
    </svg>
  ),
};

/**
 * Interactive mission-style shortcuts.
 */
export default function QuickActionGrid({ actions }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {actions.map((a) => (
        <Link
          key={a.to + a.label}
          to={a.to}
          className="action-card group flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-[#c5a667]/60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#143554] bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 group-hover:from-[#e8f2fb] group-hover:to-white group-hover:border-[#1f4d7a]/30 transition-colors">
            {ICONS[a.icon] || ICONS.chart}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="block text-sm font-bold text-slate-900 group-hover:text-[#1f4d7a]">
                {a.label}
              </span>
              <span className="text-xs font-semibold text-[#c5a667] opacity-0 group-hover:opacity-100 transition-opacity">
                Go →
              </span>
            </span>
            {a.hint && <span className="block text-xs text-slate-500 mt-1 leading-snug">{a.hint}</span>}
            {a.xp && (
              <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                +{a.xp} XP
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}

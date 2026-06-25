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
 * Mission-style shortcuts with visible XP rewards.
 */
export default function QuickActionGrid({ actions }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {actions.map((a) => (
        <Link
          key={a.to + a.label}
          to={a.to}
          className="action-card group flex items-start gap-4 p-4 border border-slate-200/90 bg-white/95"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ice-700 bg-gradient-to-br from-ice-50 to-violet-50 border border-ice-200/80 group-hover:from-ice-100 group-hover:to-violet-100 group-hover:scale-105 transition-all">
            {ICONS[a.icon] || ICONS.chart}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 flex-wrap">
              <span className="block text-sm font-bold text-slate-900 group-hover:text-ice-700 transition-colors">
                {a.label}
              </span>
              {a.xp != null && (
                <span className="badge-xp shrink-0">+{a.xp} XP</span>
              )}
            </span>
            {a.hint && <span className="block text-xs text-slate-500 mt-1 leading-snug">{a.hint}</span>}
            <span className="inline-block mt-2 text-[10px] font-semibold text-ice-600 opacity-80 group-hover:opacity-100">
              Start mission →
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * KPI tile — teal / violet accents with hover lift.
 */
export default function MetricCard({ label, value, hint, trend, accent = 'teal' }) {
  const border =
    accent === 'violet'
      ? 'border-l-violet-500 border-t-violet-400'
      : accent === 'emerald'
        ? 'border-l-emerald-500 border-t-emerald-400'
        : 'border-l-teal-500 border-t-teal-400';

  const glow =
    accent === 'violet'
      ? 'radial-gradient(circle at top right, #a5b4fc, transparent 70%)'
      : accent === 'emerald'
        ? 'radial-gradient(circle at top right, #6ee7b7, transparent 70%)'
        : 'radial-gradient(circle at top right, #5eead4, transparent 70%)';

  return (
    <div
      className={`metric-card bg-white/95 border border-slate-200/80 border-l-4 border-t-2 ${border} rounded-2xl p-5 relative overflow-hidden shadow-sm`}
    >
      <div
        className="absolute right-0 top-0 h-16 w-16 opacity-30 pointer-events-none"
        style={{ background: glow }}
        aria-hidden="true"
      />
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums leading-none">
        {value}
      </p>
      {hint && <p className="text-xs text-slate-600 mt-2 leading-snug">{hint}</p>}
      {trend && <p className="text-xs font-bold mt-2 text-emerald-600">{trend}</p>}
    </div>
  );
}

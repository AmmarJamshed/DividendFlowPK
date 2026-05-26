/**
 * Simple KPI tile — plain label + big number for non-expert users.
 */
export default function MetricCard({ icon, label, value, hint, trend, accent = 'teal' }) {
  const accents = {
    teal: 'border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white',
    emerald: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white',
    amber: 'border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white',
    violet: 'border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white',
    slate: 'border-slate-200/80 bg-gradient-to-br from-slate-50/90 to-white',
  };
  const valueColors = {
    teal: 'text-teal-800',
    emerald: 'text-emerald-800',
    amber: 'text-amber-900',
    violet: 'text-violet-800',
    slate: 'text-slate-800',
  };

  return (
    <div className={`metric-card rounded-2xl border p-4 shadow-sm ${accents[accent] || accents.teal}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <p className={`text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums leading-none ${valueColors[accent] || valueColors.teal}`}>
            {value}
          </p>
          {hint && <p className="text-xs text-slate-600 mt-2 leading-snug">{hint}</p>}
        </div>
        {icon && (
          <span className="text-2xl shrink-0 opacity-90" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      {trend && <p className="text-xs font-semibold mt-2 text-slate-600">{trend}</p>}
    </div>
  );
}

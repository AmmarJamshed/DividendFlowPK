import HelpTip from './HelpTip';

export default function MetricCard({ label, value, hint, tip, trend, accent = 'brand' }) {
  const border =
    accent === 'violet'
      ? 'border-l-violet-500'
      : accent === 'emerald'
        ? 'border-l-emerald-500'
        : accent === 'orange'
          ? 'border-l-[#F97316]'
          : 'border-l-[#1E3A8A]';

  return (
    <div className={`df-card metric-card border-l-4 ${border} p-5 relative overflow-hidden`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
        {label}
        {tip ? <HelpTip text={tip} /> : null}
      </p>
      <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums leading-none">
        {value}
      </p>
      {hint && <p className="text-xs text-slate-600 mt-2 leading-snug">{hint}</p>}
      {trend && <p className="text-xs font-bold mt-2 text-emerald-600">{trend}</p>}
    </div>
  );
}

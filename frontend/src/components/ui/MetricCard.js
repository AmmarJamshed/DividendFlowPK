/**
 * KPI tile — exchange-style: label, figure, footnote. No decorative icons.
 */
export default function MetricCard({ label, value, hint, trend }) {
  return (
    <div className="metric-card bg-white border border-neutral-200 border-t-2 border-t-[#0077c8] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="text-2xl sm:text-3xl font-semibold text-neutral-900 mt-2 tabular-nums leading-none tracking-tight">
        {value}
      </p>
      {hint && <p className="text-xs text-neutral-600 mt-2 leading-snug">{hint}</p>}
      {trend && <p className="text-xs font-medium mt-2 text-neutral-700">{trend}</p>}
    </div>
  );
}

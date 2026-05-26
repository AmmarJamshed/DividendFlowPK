import { Link } from 'react-router-dom';

/**
 * Large tap-friendly shortcuts for common tasks.
 */
export default function QuickActionGrid({ actions }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.map((a) => (
        <Link
          key={a.to + a.label}
          to={a.to}
          className="group flex flex-col gap-2 p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-teal-300 hover:shadow-lg hover:shadow-teal-100/50 transition-all"
        >
          <span className="text-2xl" aria-hidden>
            {a.icon}
          </span>
          <span className="font-bold text-slate-800 group-hover:text-teal-800">{a.label}</span>
          <span className="text-xs text-slate-500 leading-snug">{a.hint}</span>
        </Link>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';

/**
 * Institutional quick links — title + arrow, minimal chrome.
 */
export default function QuickActionGrid({ actions }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 border border-neutral-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
      {actions.map((a) => (
        <Link
          key={a.to + a.label}
          to={a.to}
          className="group flex items-center justify-between gap-4 px-5 py-4 hover:bg-neutral-50 transition-colors"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-neutral-900 group-hover:text-[#0077c8]">
              {a.label}
            </span>
            {a.hint && (
              <span className="block text-xs text-neutral-500 mt-1 leading-snug">{a.hint}</span>
            )}
          </span>
          <span
            className="shrink-0 text-neutral-400 group-hover:text-[#0077c8] text-lg font-light"
            aria-hidden
          >
            →
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Accessible “?” help control — hover/focus shows explanation (beginner-friendly).
 */
export default function HelpTip({ text, className = '' }) {
  if (!text) return null;
  return (
    <span className={`group/tip relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        className="w-4 h-4 rounded-full bg-slate-200/90 text-slate-600 text-[10px] font-bold leading-none hover:bg-teal-100 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        aria-label={text}
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 px-2.5 py-2 text-[11px] font-normal normal-case tracking-normal text-white leading-snug opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 sm:w-64"
      >
        {text}
      </span>
    </span>
  );
}

export function LabelWithTip({ label, tip, htmlFor, className = '' }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2 ${className}`}
    >
      <span>{label}</span>
      {tip ? <HelpTip text={tip} /> : null}
    </label>
  );
}

export function ThWithTip({ children, tip, className = '' }) {
  return (
    <th className={`font-semibold text-slate-600 ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {tip ? <HelpTip text={tip} /> : null}
      </span>
    </th>
  );
}

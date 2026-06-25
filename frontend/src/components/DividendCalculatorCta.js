import { Link } from 'react-router-dom';

/** Prominent link to dividend calculator on calendar page. */
export default function DividendCalculatorCta({ className = '' }) {
  return (
    <div
      className={`rounded-2xl border-2 border-ice-300 bg-gradient-to-r from-ice-50 via-white to-emerald-50/80 px-5 py-4 shadow-sm ${className}`}
    >
      <p className="text-base sm:text-lg font-semibold text-slate-800 leading-snug">
        If you wish to know how much dividends you&apos;ll get this time,{' '}
        <Link
          to="/dividend-calendar#dividend-calculator"
          className="text-ice-700 underline decoration-2 underline-offset-2 hover:text-ink"
        >
          please click here
        </Link>
        .
      </p>
      <p className="text-xs text-slate-500 mt-2">
        Opens the dividend calculator — enter your symbols and share counts to estimate cash by month.
      </p>
    </div>
  );
}

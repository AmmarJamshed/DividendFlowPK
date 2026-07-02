import PageHero from '../components/ui/PageHero';
import Disclaimer from '../components/Disclaimer';
import { usePageTitle } from '../hooks/usePageTitle';

const PLANNED_COVERAGE = [
  { label: 'PSX-licensed brokers', note: 'Traditional and online trading accounts' },
  { label: 'CDC & NCCPL', note: 'Central depository and settlement context' },
  { label: 'Shariah-compliant options', note: 'Where disclosed by PSX or the broker' },
];

export default function MarketBrokers() {
  usePageTitle('Market brokers — DividendFlow PK');

  return (
    <div className="df-page">
      <PageHero
        variant="light"
        eyebrow="PSX · Directory"
        title="Market brokers"
        description="A Pakistan-focused directory of stock brokers so you can compare where to open a PSX trading account."
      />

      <div className="card p-8 sm:p-10 text-center border-dashed border-2 border-ice-200/80 bg-gradient-to-b from-ice-50/50 to-white">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-200/80 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          Coming soon
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">PSX broker directory in progress</h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          We are building a catalogue of PSX-licensed brokers and popular online platforms in Pakistan.
          You will be able to browse regulated firms and compare account types — all in one place.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100">
          <h3 className="card-header text-lg">Planned coverage</h3>
          <p className="card-subtitle">What we will list first for Pakistan investors</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {PLANNED_COVERAGE.map(({ label, note }) => (
            <li key={label} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-5 sm:px-6 py-4">
              <span className="font-semibold text-slate-800">{label}</span>
              <span className="text-sm text-slate-500">{note}</span>
            </li>
          ))}
        </ul>
      </div>

      <Disclaimer />
    </div>
  );
}

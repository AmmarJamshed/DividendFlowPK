import PageHero from '../components/ui/PageHero';
import Disclaimer from '../components/Disclaimer';
import { usePageTitle } from '../hooks/usePageTitle';

const PLANNED_REGIONS = [
  { region: 'Pakistan', note: 'PSX-licensed brokers and online trading platforms' },
  { region: 'United States', note: 'NYSE, NASDAQ, and regional brokerages' },
  { region: 'United Kingdom', note: 'LSE and ISA/SIPP-friendly providers' },
  { region: 'Hong Kong', note: 'HKEX-connected brokers for Asia exposure' },
  { region: 'Europe & GCC', note: 'Multi-market access and local regulated firms' },
];

export default function MarketBrokers() {
  usePageTitle('Market brokers — DividendFlow PK');

  return (
    <div className="space-y-6">
      <PageHero
        variant="light"
        eyebrow="Global markets · Directory"
        title="Market brokers"
        description="A country-by-country directory of stock brokers so you can compare where to open a trading account — whether you invest on PSX or international exchanges."
      />

      <div className="card p-8 sm:p-10 text-center border-dashed border-2 border-teal-200/80 bg-gradient-to-b from-teal-50/50 to-white">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-200/80 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          Coming soon
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Broker directory in progress</h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          We are building a scraper-backed catalogue of stock brokers across each country and exchange we cover.
          You will be able to browse regulated firms, compare account types, and see which markets each broker
          supports — all in one place.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100">
          <h3 className="card-header text-lg">Planned coverage</h3>
          <p className="card-subtitle">Regions we will list first as broker data is collected</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {PLANNED_REGIONS.map(({ region, note }) => (
            <li key={region} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-5 sm:px-6 py-4">
              <span className="font-semibold text-slate-800">{region}</span>
              <span className="text-sm text-slate-500">{note}</span>
            </li>
          ))}
        </ul>
      </div>

      <Disclaimer />
    </div>
  );
}

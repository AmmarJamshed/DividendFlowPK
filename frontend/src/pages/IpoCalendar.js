import { useState, useEffect } from 'react';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import PageHero from '../components/ui/PageHero';
import MetricCard from '../components/ui/MetricCard';
import Disclaimer from '../components/Disclaimer';
import { usePageTitle } from '../hooks/usePageTitle';

const PHASE_STYLES = {
  subscription_open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  book_building: 'bg-violet-100 text-violet-800 border-violet-200',
  registration_open: 'bg-amber-100 text-amber-800 border-amber-200',
  upcoming: 'bg-sky-100 text-sky-800 border-sky-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '—';
  const code = currency || '';
  return `${code} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`.trim();
}

function DateRow({ label, start, end }) {
  if (!start && !end) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-700 tabular-nums">
        {start && end && start !== end
          ? `${formatDate(start)} – ${formatDate(end)}`
          : formatDate(start || end)}
      </span>
    </div>
  );
}

function RegistrationLinks({ registrationLinks, ipoRegisterUrl }) {
  if (!registrationLinks?.links?.length && !ipoRegisterUrl) return null;
  const items = registrationLinks?.links?.length
    ? registrationLinks.links
    : [{ label: 'Apply / register', href: ipoRegisterUrl, primary: true }];

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {items.map(({ href, label, primary }) => (
        <a
          key={`${href}-${label}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            primary
              ? 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-ink text-white hover:bg-ink-soft transition-colors shadow-md shadow-ink/20'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:border-ice-300 hover:text-ice-700 bg-white transition-colors'
          }
        >
          {label}
          <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  );
}

function phaseHelpText(ipo, exchange) {
  if (ipo.phase === 'subscription_open') {
    return exchange === 'PSX'
      ? 'Public subscription is open — apply through PSX e-IPO or CDC e-IPO using your CNIC and bank account.'
      : 'Offering window is open or pricing is imminent — apply through your broker or the official exchange portal below.';
  }
  if (ipo.phase === 'registration_open') {
    return exchange === 'PSX'
      ? 'Register on PSX e-IPO now so you are ready when the public subscription window opens.'
      : 'Complete investor registration with your broker or the exchange portal before the subscription dates.';
  }
  return 'Register ahead of the subscription dates so you can apply as soon as the offer opens.';
}

function IpoCard({ ipo }) {
  const phaseClass = PHASE_STYLES[ipo.phase] || PHASE_STYLES.upcoming;
  const showRegister =
    ipo.phase === 'registration_open' ||
    ipo.phase === 'subscription_open' ||
    ipo.phase === 'upcoming';

  return (
    <article className="card overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {ipo.offerType} · {ipo.exchange}
              {ipo.symbol ? ` · ${ipo.symbol}` : ''}
            </p>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">{ipo.companyName}</h3>
            {ipo.parentCompany && (
              <p className="text-sm text-slate-500 mt-1">Subsidiary of {ipo.parentCompany}</p>
            )}
            {ipo.sector && <p className="text-sm text-ice-700 mt-1">{ipo.sector}</p>}
          </div>
          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold border ${phaseClass}`}>
            {ipo.phaseLabel}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Key dates</h4>
          <DateRow label="Investor registration" start={ipo.registrationStart} end={ipo.registrationEnd} />
          <DateRow label="Book building" start={ipo.bookBuildingStart} end={ipo.bookBuildingEnd} />
          <DateRow label="Public subscription / pricing" start={ipo.subscriptionStart} end={ipo.subscriptionEnd} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Offer details</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Floor price</dt>
              <dd className="font-medium text-slate-800">{formatPrice(ipo.floorPrice, ipo.currency)}</dd>
            </div>
            {ipo.priceCap != null && ipo.priceCap !== ipo.floorPrice && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Price cap</dt>
                <dd className="font-medium text-slate-800">{formatPrice(ipo.priceCap, ipo.currency)}</dd>
              </div>
            )}
            {ipo.issueSizeShares != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Issue size</dt>
                <dd className="font-medium text-slate-800 tabular-nums">
                  {Number(ipo.issueSizeShares).toLocaleString('en-US')} shares
                </dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-2 mt-4">
            {ipo.prospectusUrl && (
              <a
                href={ipo.prospectusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-ice-700 hover:underline"
              >
                Download prospectus ↗
              </a>
            )}
            {ipo.companyUrl && (
              <a
                href={ipo.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-slate-600 hover:text-ice-700 hover:underline"
              >
                Company website ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {showRegister && (
        <div className="px-5 sm:px-6 py-4 bg-ice-50/60 border-t border-ice-100">
          <p className="text-sm text-slate-700 leading-relaxed">{phaseHelpText(ipo, ipo.exchange)}</p>
          <RegistrationLinks registrationLinks={ipo.registrationLinks} ipoRegisterUrl={ipo.registerUrl} />
        </div>
      )}

      {ipo.notes && (
        <p className="px-5 sm:px-6 py-3 text-xs text-slate-500 border-t border-slate-100 bg-slate-50/50">
          {ipo.notes}
          {ipo.source ? ` Source: ${ipo.source}.` : ''}
        </p>
      )}
    </article>
  );
}

export default function IpoCalendar() {
  const { exchange, exchangeConfig } = useExchange();
  const [data, setData] = useState({ rows: [], summary: null, registrationLinks: null });
  const [loading, setLoading] = useState(true);

  usePageTitle('IPO calendar — DividendFlow PK');

  useEffect(() => {
    setLoading(true);
    api.getIpos(exchange)
      .then((res) => setData(res.data || { rows: [], summary: null }))
      .catch(() => setData({ rows: [], summary: null }))
      .finally(() => setLoading(false));
  }, [exchange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-10 h-10 border-2 border-ice-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const links = data.registrationLinks;

  return (
    <div className="df-page">
      <PageHero
        variant="light"
        eyebrow={`${exchangeConfig.code} · Primary market`}
        title="Upcoming IPOs"
        description={`Track ${exchangeConfig.name} initial public offerings with subscription dates and official registration portals. Expired listings are removed automatically each week.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Listings tracked" value={data.summary?.total ?? data.rows.length} />
        <MetricCard label="Open now" value={data.summary?.openNow ?? 0} hint="Registration, book building, or subscription" />
        <MetricCard label="Upcoming" value={data.summary?.upcoming ?? 0} hint="Future subscription windows" />
      </div>

      {links && (
        <div className="card p-5 sm:p-6 border-ice-200/80 bg-gradient-to-br from-ice-50/80 to-white">
          <h3 className="text-sm font-bold text-slate-900">How to register for {exchangeConfig.code} IPOs</h3>
          {links.note && (
            <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-3xl">{links.note}</p>
          )}
          <RegistrationLinks registrationLinks={links} />
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="card p-8 text-center text-slate-600">
          <p className="font-medium text-slate-800">No upcoming IPOs for {exchangeConfig.name} right now.</p>
          <p className="mt-2 text-sm">
            We only show offerings with dates on or after today. Check again after the weekly sync or visit the
            official exchange portal below.
          </p>
          {links && <RegistrationLinks registrationLinks={links} />}
        </div>
      ) : (
        <div className="space-y-5">
          {data.rows.map((ipo) => (
            <IpoCard key={ipo.id} ipo={ipo} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        IPO dates are sourced from official prospectuses and exchange calendars, then refreshed weekly. DividendFlow
        does not facilitate subscriptions — always confirm details on the official exchange site before investing.
        {data.asOf ? ` As of ${data.asOf}.` : ''}
      </p>

      <Disclaimer />
    </div>
  );
}

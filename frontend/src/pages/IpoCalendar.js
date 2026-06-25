import { useState, useEffect } from 'react';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import PageHero from '../components/ui/PageHero';
import MetricCard from '../components/ui/MetricCard';
import Disclaimer from '../components/Disclaimer';
import { usePageTitle } from '../hooks/usePageTitle';

const PSX_ONLY = new Set(['PSX']);

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

function formatPrice(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
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

function RegistrationLinks({ links }) {
  if (!links) return null;
  const items = [
    { href: links.psxEipoRegister, label: 'Register on PSX e-IPO', primary: true },
    { href: links.psxEipo, label: 'PSX e-IPO portal' },
    { href: links.cdcEipo, label: 'CDC e-IPO' },
    { href: links.publicPride, label: 'PSX Public PRIDE' },
  ];
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {items.map(({ href, label, primary }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            primary
              ? 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors shadow-md shadow-teal-300/30'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:border-teal-300 hover:text-teal-700 bg-white transition-colors'
          }
        >
          {label}
          <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  );
}

function IpoCard({ ipo }) {
  const phaseClass = PHASE_STYLES[ipo.phase] || PHASE_STYLES.upcoming;
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
            {ipo.sector && <p className="text-sm text-teal-700 mt-1">{ipo.sector}</p>}
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
          <DateRow label="Public subscription" start={ipo.subscriptionStart} end={ipo.subscriptionEnd} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Offer details</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Floor price</dt>
              <dd className="font-medium text-slate-800">{formatPrice(ipo.floorPricePkr)}</dd>
            </div>
            {ipo.priceCapPkr != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Price cap (book building)</dt>
                <dd className="font-medium text-slate-800">{formatPrice(ipo.priceCapPkr)}</dd>
              </div>
            )}
            {ipo.issueSizeShares != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Issue size</dt>
                <dd className="font-medium text-slate-800 tabular-nums">
                  {Number(ipo.issueSizeShares).toLocaleString('en-PK')} shares
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
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                Download prospectus ↗
              </a>
            )}
            {ipo.companyUrl && (
              <a
                href={ipo.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-slate-600 hover:text-teal-700 hover:underline"
              >
                Company website ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {(ipo.phase === 'registration_open' || ipo.phase === 'subscription_open' || ipo.phase === 'upcoming') && (
        <div className="px-5 sm:px-6 py-4 bg-teal-50/60 border-t border-teal-100">
          <p className="text-sm text-slate-700 leading-relaxed">
            {ipo.phase === 'subscription_open'
              ? 'Public subscription is open — apply through PSX e-IPO or CDC e-IPO using your CNIC and bank account.'
              : ipo.phase === 'registration_open'
                ? 'Register now on PSX e-IPO so you are ready when the public subscription window opens.'
                : 'Register on PSX e-IPO ahead of the subscription dates to receive alerts and apply electronically.'}
          </p>
          <RegistrationLinks links={ipo.registrationLinks} />
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
  const isPsx = PSX_ONLY.has(exchange);
  const [data, setData] = useState({ rows: [], summary: null, registrationLinks: null });
  const [loading, setLoading] = useState(true);

  usePageTitle('IPO calendar — DividendFlow PK');

  useEffect(() => {
    if (!isPsx) {
      setData({ rows: [], summary: null, registrationLinks: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getIpos(exchange)
      .then((res) => setData(res.data || { rows: [], summary: null }))
      .catch(() => setData({ rows: [], summary: null }))
      .finally(() => setLoading(false));
  }, [exchange, isPsx]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-10 h-10 border-2 border-teal-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        variant="light"
        eyebrow={`${exchangeConfig.code} · Primary market`}
        title="Upcoming IPOs"
        description={
          isPsx
            ? 'Track Pakistan Stock Exchange initial public offerings, key subscription dates, and official links to register on PSX e-IPO or CDC e-IPO before you apply.'
            : `IPO coverage for ${exchangeConfig.name} is planned. Switch to Pakistan (PSX) to see live PSX offerings.`
        }
      />

      {isPsx && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard label="Listings tracked" value={data.summary?.total ?? data.rows.length} />
            <MetricCard label="Open now" value={data.summary?.openNow ?? 0} hint="Registration, book building, or subscription" />
            <MetricCard label="Upcoming" value={data.summary?.upcoming ?? 0} hint="Future subscription windows" />
          </div>

          {data.registrationLinks && (
            <div className="card p-5 sm:p-6 border-teal-200/80 bg-gradient-to-br from-teal-50/80 to-white">
              <h3 className="text-sm font-bold text-slate-900">How to register for PSX IPOs</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-3xl">
                PSX e-IPO registration is free and available year-round. You need a valid CNIC, email, and mobile
                number. Retail investors typically apply during the public subscription dates via{' '}
                <strong>PSX e-IPO (PES)</strong> or <strong>CDC Centralized e-IPO (CES)</strong>.
              </p>
              <RegistrationLinks links={data.registrationLinks} />
            </div>
          )}

          {data.rows.length === 0 ? (
            <div className="card p-8 text-center text-slate-600">
              <p className="font-medium text-slate-800">No upcoming IPOs in our tracker right now.</p>
              <p className="mt-2 text-sm">
                Check PSX Public PRIDE or register on e-IPO to get alerts when new offerings are announced.
              </p>
              {data.registrationLinks && <RegistrationLinks links={data.registrationLinks} />}
            </div>
          ) : (
            <div className="space-y-5">
              {data.rows.map((ipo) => (
                <IpoCard key={ipo.id} ipo={ipo} />
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">
            IPO dates and prices are taken from official PSX prospectuses and may change. DividendFlow does not
            facilitate subscriptions — always confirm details on{' '}
            <a href="https://www.psx.com.pk/" className="text-teal-700 hover:underline" target="_blank" rel="noopener noreferrer">
              psx.com.pk
            </a>{' '}
            and the published prospectus before investing.
          </p>
        </>
      )}

      {!isPsx && (
        <div className="card p-8 sm:p-10 text-center border-dashed border-2 border-teal-200/80">
          <h2 className="text-xl font-bold text-slate-900">Global IPO calendar coming soon</h2>
          <p className="mt-3 text-sm text-slate-600 max-w-xl mx-auto">
            We are starting with Pakistan (PSX) listings. Use the market selector in the header and choose{' '}
            <strong>Pakistan (PSX)</strong> to view upcoming IPOs and registration links.
          </p>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

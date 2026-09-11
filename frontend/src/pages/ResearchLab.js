import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import PageHero from '../components/ui/PageHero';

const AUDIENCES = [
  { id: 'market_researcher', label: 'Market researcher' },
  { id: 'analyst', label: 'Research analyst' },
  { id: 'demand_planner', label: 'Demand & supply planner' },
];

export default function ResearchLab() {
  const [topic, setTopic] = useState('Pakistan fast food market');
  const [audience, setAudience] = useState('market_researcher');
  const [symbols, setSymbols] = useState('NESTLE,UNITY');
  const [geo, setGeo] = useState('Pakistan');
  const [offline, setOffline] = useState(true);
  const [email, setEmail] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [reports, setReports] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [stocks, setStocks] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshReports = useCallback(async () => {
    try {
      const { data } = await api.getResearchReports();
      setReports(data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load reports');
    }
  }, []);

  useEffect(() => {
    refreshReports();
  }, [refreshReports]);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.getResearchJob(jobId);
        if (cancelled) return;
        setJob(data);
        if (data.status === 'completed' && data.slug) {
          setActiveSlug(data.slug);
          setBusy(false);
          refreshReports();
          if (data.email_sent) {
            setEmailNote(`Report emailed to ${data.email}.`);
          } else if (data.email && data.email_error) {
            setEmailNote(`Report ready, but email failed: ${data.email_error}`);
          } else if (data.email) {
            setEmailNote('Report ready — email delivery pending or not configured on server.');
          }
          try {
            const stockRes = await api.getResearchReportStocks(data.slug);
            setStocks(stockRes.data);
          } catch {
            setStocks(null);
          }
        } else if (data.status === 'failed') {
          setBusy(false);
          setError(data.error || 'Research job failed');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, refreshReports]);

  async function startJob(e) {
    e.preventDefault();
    setError('');
    setEmailNote('');
    setBusy(true);
    setJob(null);
    setActiveSlug(null);
    setStocks(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setBusy(false);
      setError('Enter your email to receive the generated report.');
      return;
    }
    try {
      const { data } = await api.createResearchJob({
        topic,
        audience,
        geo,
        email: trimmedEmail,
        symbols: symbols.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
        offline,
      });
      setJobId(data.id);
      setJob(data);
      if (data.email_delivery === 'queued_but_server_email_not_configured') {
        setEmailNote('Job started. Server email is not configured yet — you can still open the report here and use “Email me this report” after deploy.');
      } else {
        setEmailNote('Job started. We will email the report when it is ready.');
      }
    } catch (err) {
      setBusy(false);
      setError(err.response?.data?.error || err.message || 'Could not start job');
    }
  }

  async function emailActiveReport() {
    if (!activeSlug || !email.trim()) {
      setError('Select a report and enter your email first.');
      return;
    }
    setError('');
    try {
      const { data } = await api.emailResearchReport(activeSlug, email.trim());
      setEmailNote(`Report emailed to ${email.trim()} (${data.channel}).`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not email report');
    }
  }

  async function openReport(slug) {
    setActiveSlug(slug);
    try {
      const stockRes = await api.getResearchReportStocks(slug);
      setStocks(stockRes.data);
    } catch {
      setStocks(null);
    }
  }

  const htmlSrc = activeSlug ? api.researchReportHtmlUrl(activeSlug) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHero
        title="Research Lab"
        description="Market Research Crawler Agent — sector briefs with citations and PSX stock join for analysts, researchers, and demand planners."
      />

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600 mb-4">
          “I scan. You decide.” — crawl allowlisted public sources, synthesize a Simple Word answer report, and attach live DividendFlow price/dividend peers.
        </p>
        <form onSubmit={startJob} className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Pakistan cement demand 2026"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Geo</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email (required — we send the report here)</span>
            <input
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">PSX symbols (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              placeholder="LUCK,MLCF,DGKC"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
            Offline / deterministic mode (no Groq — recommended for demos)
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !topic.trim()}
              className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Running…' : 'Generate & email report'}
            </button>
            <button
              type="button"
              onClick={emailActiveReport}
              disabled={!activeSlug || !email.trim()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              Email me this report
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {emailNote && <p className="mt-2 text-sm text-emerald-700">{emailNote}</p>}
        {job && (
          <p className="mt-3 text-xs text-slate-500">
            Job <code>{job.id || jobId}</code> · status <strong>{job.status}</strong>
            {job.slug ? ` · slug ${job.slug}` : ''}
            {job.email_sent ? ' · emailed' : ''}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Saved reports</h2>
          <ul className="mt-3 space-y-2">
            {reports.length === 0 && <li className="text-xs text-slate-500">No reports yet — run a job.</li>}
            {reports.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => openReport(r.slug)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    activeSlug === r.slug
                      ? 'border-[#1E3A8A] bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-medium text-slate-900 line-clamp-2">{r.topic}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{r.audience} · {r.geo}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Report viewer</h2>
            {htmlSrc && (
              <a href={htmlSrc} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1E3A8A]">
                Open full HTML
              </a>
            )}
          </div>
          {htmlSrc ? (
            <iframe title="Research report" src={htmlSrc} className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />
          ) : (
            <p className="text-sm text-slate-500">Select or generate a report to preview it here.</p>
          )}

          {stocks && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">PSX stock join</h3>
              <p className="text-xs text-slate-500 mt-1">{stocks.note}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(stocks.resolved || []).map((s) => (
                  <div key={s.symbol} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{s.symbol}</div>
                    <div className="text-sm text-[#f05a22]">
                      {s.price != null ? `Rs ${s.price}` : '—'}
                      {s.change_pct != null ? ` (${s.change_pct}%)` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500">{s.as_of || ''} {s.dividend_yield != null ? `· yield ${s.dividend_yield}%` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Disclaimer />
      </div>
    </div>
  );
}

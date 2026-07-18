import { useState } from 'react';
import { api } from '../api';

const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

export default function ComingSoon() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | err
  const [message, setMessage] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('err');
      setMessage('Please enter a valid email address.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      await api.subscribeWaitlist({ email: trimmed });
      setStatus('ok');
      setMessage('Thanks — we will email you when the surprise drops.');
      setEmail('');
    } catch (err) {
      const detail = err?.response?.data?.error || err?.message || 'Something went wrong. Try again.';
      setStatus('err');
      setMessage(detail);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0e14] text-white font-sans">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(30,58,138,0.55), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(249,115,22,0.18), transparent 50%), linear-gradient(180deg, #0a0e14 0%, #121a28 100%)',
        }}
      />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-5 py-16 text-center">
        <img src={LOGO} alt="" className="w-16 h-16 rounded-2xl shadow-lg mb-6" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400 mb-3">
          DividendFlow PK
        </p>
        <h1 className="max-w-2xl text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
          Dividend Flow PK has been removed temporarily
        </h1>
        <p className="mt-5 max-w-xl text-base sm:text-lg text-slate-300 leading-relaxed">
          We&apos;re stepping away to become something{' '}
          <span className="text-white font-semibold">far bigger</span> — a surprise.
          The site, scrapers, and public tools are offline for now.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-10 w-full max-w-md flex flex-col sm:flex-row gap-2 sm:gap-0 sm:rounded-2xl sm:bg-white/5 sm:ring-1 sm:ring-white/15 sm:p-1.5"
        >
          <label htmlFor="waitlist-email" className="sr-only">
            Email for news
          </label>
          <input
            id="waitlist-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'loading'}
            className="flex-1 min-w-0 rounded-xl sm:rounded-xl bg-white/10 sm:bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-orange-400/60"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="shrink-0 rounded-xl bg-[#F97316] hover:bg-orange-500 disabled:opacity-60 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors"
          >
            {status === 'loading' ? 'Subscribing…' : 'Notify me'}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 text-sm max-w-md ${
              status === 'ok' ? 'text-emerald-300' : 'text-red-300'
            }`}
            role="status"
          >
            {message}
          </p>
        )}

        <p className="mt-8 text-xs text-slate-500 max-w-sm leading-relaxed">
          Subscribe by email for launch news. No spam — only the surprise when it&apos;s ready.
        </p>
      </div>
    </div>
  );
}

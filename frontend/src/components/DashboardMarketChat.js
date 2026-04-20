import { useState, useRef, useLayoutEffect } from 'react';
import { api } from '../api';

const SUGGESTIONS = [
  'Which stocks led gains in the latest scrape?',
  'Which names declined most in the saved data?',
  'Summarize constructive signals from the news file.',
  'Any names the commentary flags as stressed or risky?',
];

function Spinner() {
  return <div className="w-5 h-5 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin shrink-0" aria-hidden />;
}

export default function DashboardMarketChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text:
        "I'm **Market Buddy**. Ask about **PSX movers and headlines** in DividendFlow's latest saved scrape — I only summarize what's in those files, not live tape or bespoke advice.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  /** Inner message list scroll */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  /** Snapshot main content scroller + window so Ask / Enter does not yank the page */
  const scrollLockRef = useRef(null);

  function capturePageScroll() {
    const main = document.querySelector('[data-app-scroll-root]');
    scrollLockRef.current = {
      mainTop: main ? main.scrollTop : null,
      winY: window.scrollY,
    };
  }

  useLayoutEffect(() => {
    const snap = scrollLockRef.current;
    if (snap) {
      const main = document.querySelector('[data-app-scroll-root]');
      if (main != null && snap.mainTop != null) main.scrollTop = snap.mainTop;
      if (typeof snap.winY === 'number') window.scrollTo(0, snap.winY);
      scrollLockRef.current = null;
    }
    const inner = scrollRef.current;
    if (inner) inner.scrollTop = inner.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    capturePageScroll();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const { data } = await api.postMarketChat({ message: q });
      const reply = data.reply || 'No answer came back.';
      capturePageScroll();
      setMessages((m) => [...m, { role: 'assistant', text: reply, disclaimer: data.disclaimer }]);
    } catch (err) {
      const msg =
        err.response?.data?.reply ||
        err.response?.data?.message ||
        (err.response?.status === 429 ? 'Too fast — wait a few seconds and try again.' : 'Something went wrong. Try again.');
      capturePageScroll();
      setMessages((m) => [...m, { role: 'assistant', text: String(msg) }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <section
      id="market-chat"
      className="card p-0 overflow-hidden border-2 border-teal-200/60 shadow-lg shadow-teal-200/20 scroll-mt-24"
      data-ai-hint="Ask the Market Buddy about stocks from the latest saved news and prices"
    >
      <div className="bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-600 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-2xl" aria-hidden>
            🌟
          </span>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Market Buddy — Q&amp;A on the latest scrape</h2>
        </div>
        <p className="text-sm text-white/95 leading-relaxed max-w-3xl">
          Built for <strong>analysts, advisors, and serious retail users</strong> as well as newcomers. Replies use{' '}
          <strong>the same batch data</strong> DividendFlow ingests after each run — useful for a quick read, not a substitute for your own
          models or broker tools.
        </p>
      </div>

      <div className="px-4 sm:px-5 py-3 bg-amber-50/90 border-b border-amber-200">
        <p className="text-xs sm:text-sm text-amber-950 leading-relaxed">
          <strong className="font-bold">Important:</strong> output is <strong>AI-generated</strong> from archived CSVs —{' '}
          <strong>not verified for completeness</strong>, <strong>not a forecast</strong>, and <strong>not investment, legal, or tax advice</strong>.
          Verify against primary sources and your compliance process before acting.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Try asking</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => send(s)}
              disabled={loading}
              className="text-left text-xs sm:text-sm px-3 py-2 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 hover:bg-teal-100 transition-colors disabled:opacity-50 max-w-full"
            >
              {s}
            </button>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="rounded-2xl bg-slate-50 border border-slate-200 max-h-[min(22rem,50vh)] overflow-y-auto overflow-x-hidden p-3 space-y-3 overscroll-contain"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user' ? 'bg-white border border-slate-200 text-slate-800 ml-4' : 'bg-white border border-teal-100 text-slate-700 mr-4'
              }`}
            >
              {msg.role === 'assistant' && <p className="text-[10px] font-bold text-teal-700 mb-1">Market Buddy</p>}
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.disclaimer && (
                <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-200 leading-snug">{msg.disclaimer}</p>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-600 px-2 py-2">
              <Spinner />
              <span>Reading latest scrape…</span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="e.g. Top advancers vs decliners in the last file?"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50 text-sm"
            disabled={loading}
            maxLength={2000}
            aria-label="Your question for Market Buddy"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="btn-primary shrink-0 px-6 py-3 sm:py-2.5 disabled:opacity-50"
          >
            {loading ? 'Wait…' : 'Ask'}
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center leading-snug">
          Model: Groq. Same inputs as the dashboard news / movers panels — sparse files mean shorter answers.
        </p>
      </div>
    </section>
  );
}

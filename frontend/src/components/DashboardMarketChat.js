import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

const SUGGESTIONS = [
  'Which stocks went up the most in the last scrape?',
  'Which stocks look sad or down in the data?',
  'What does the news hint could go better later?',
  'Any stocks the news says might face trouble?',
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
        "Hi! I'm Market Buddy. Ask me about **which PSX stocks moved up or down** in our latest saved data, or what the **news lines** might mean — I only read what DividendFlow already scraped, so I'm like a smart parrot, not a crystal ball.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const { data } = await api.postMarketChat({ message: q });
      const reply = data.reply || 'No answer came back.';
      setMessages((m) => [...m, { role: 'assistant', text: reply, disclaimer: data.disclaimer }]);
    } catch (err) {
      const msg =
        err.response?.data?.reply ||
        err.response?.data?.message ||
        (err.response?.status === 429 ? 'Too fast — wait a few seconds and try again.' : 'Something went wrong. Try again.');
      setMessages((m) => [...m, { role: 'assistant', text: String(msg) }]);
    } finally {
      setLoading(false);
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
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Market Buddy — ask in plain words</h2>
        </div>
        <p className="text-sm text-white/95 leading-relaxed max-w-3xl">
          Stocks are pieces of companies. DividendFlow saves <strong>yesterday-style numbers and news</strong> after each run.
          Ask things like &quot;who won today?&quot; or &quot;who fell?&quot; — I&apos;ll explain using <strong>only that saved info</strong>.
        </p>
      </div>

      <div className="px-4 sm:px-5 py-3 bg-amber-50/90 border-b border-amber-200">
        <p className="text-xs sm:text-sm text-amber-950 leading-relaxed">
          <strong className="font-bold">Important:</strong> answers are <strong>AI guesses</strong> built from the files we have — they are{' '}
          <strong>not 100% right</strong>, not a promise about the future, and <strong>not investment advice</strong>. Grown-ups should
          double-check everything before real money. Learning first, decisions later.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Try asking</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={loading}
              className="text-left text-xs sm:text-sm px-3 py-2 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 hover:bg-teal-100 transition-colors disabled:opacity-50 max-w-full"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 max-h-[min(22rem,50vh)] overflow-y-auto p-3 space-y-3">
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
              <span>Thinking with your latest scrape…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="e.g. Which 3 stocks had the best day in the file?"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50 text-sm"
            disabled={loading}
            maxLength={2000}
            aria-label="Your question for Market Buddy"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="btn-primary shrink-0 px-6 py-3 sm:py-2.5 disabled:opacity-50"
          >
            {loading ? 'Wait…' : 'Ask'}
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center leading-snug">
          Powered by AI (Groq). Same data as the &quot;Today vs Yesterday&quot; and news sections — if those are empty, I have less to read.
        </p>
      </div>
    </section>
  );
}

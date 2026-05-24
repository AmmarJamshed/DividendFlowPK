import { useState, useRef, useLayoutEffect, Fragment } from 'react';
import { api } from '../api';

const SUGGESTIONS = [
  { label: 'Top gainers', prompt: 'Which stocks led gains in the latest scrape?' },
  { label: 'Top decliners', prompt: 'Which names declined most in the saved data?' },
  { label: 'News themes', prompt: 'Summarize constructive signals from the news file.' },
  { label: 'Risk flags', prompt: 'Any names the commentary flags as stressed or risky?' },
];

const WELCOME =
  "Hi — I'm Market Buddy. Ask about PSX movers and headlines from DividendFlow's latest saved scrape. I summarize what's in those CSV files only — not live prices or personal investment advice.";

function Spinner() {
  return (
    <div
      className="w-5 h-5 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin shrink-0"
      aria-hidden
    />
  );
}

/** Lightweight formatting: paragraphs, bullets, **bold** — no extra deps */
function ChatMessageBody({ text }) {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);

  const renderInline = (line, keyPrefix) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      const m = part.match(/^\*\*(.+)\*\*$/);
      if (m) {
        return (
          <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-slate-900">
            {m[1]}
          </strong>
        );
      }
      return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>;
    });
  };

  return (
    <div className="space-y-2.5 text-[0.9375rem] leading-relaxed text-slate-700">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.length > 0);
        const isList = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l.trim()));
        if (isList) {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1 marker:text-teal-500">
              {lines.map((line, li) => (
                <li key={li}>{renderInline(line.replace(/^[-•*]\s+/, ''), `b${bi}-l${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="text-slate-700">
            {lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `b${bi}-p${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function BuddyAvatar({ size = 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div
      className={`${dim} shrink-0 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white font-bold flex items-center justify-center shadow-md shadow-teal-400/30`}
      aria-hidden
    >
      MB
    </div>
  );
}

export default function DashboardMarketChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
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
        (err.response?.status === 429
          ? 'Too fast — wait a few seconds and try again.'
          : 'Something went wrong. Try again.');
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
      className="card p-0 overflow-hidden border-2 border-teal-200/70 shadow-xl shadow-teal-200/25 scroll-mt-24"
      data-ai-hint="Ask the Market Buddy about stocks from the latest saved news and prices"
    >
      {/* Header */}
      <div className="relative bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-600 px-5 sm:px-6 py-5 text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 80%, white 0%, transparent 45%), radial-gradient(circle at 90% 10%, white 0%, transparent 40%)',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-start gap-4">
          <BuddyAvatar />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-100/90 mb-1">
              AI on saved scrape data
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-tight">
              Market Buddy
            </h2>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-white/90 leading-relaxed max-w-2xl">
              Quick Q&amp;A on the same PSX prices and news files that power this dashboard — for
              analysts and retail users alike. Not a substitute for your models or broker terminal.
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer — scannable */}
      <div className="px-5 sm:px-6 py-3 bg-amber-50 border-b border-amber-200/80 flex gap-3 items-start">
        <span className="text-lg shrink-0 mt-0.5" aria-hidden>
          ⚠️
        </span>
        <ul className="text-xs sm:text-sm text-amber-950 space-y-1 leading-relaxed list-none">
          <li>
            <span className="font-semibold">AI-generated</span> from archived CSVs — not verified end-to-end.
          </li>
          <li>Not a forecast or investment, legal, or tax advice. Verify before you act.</li>
        </ul>
      </div>

      <div className="p-4 sm:p-6 space-y-4 bg-gradient-to-b from-slate-50/80 to-white">
        {/* Suggestions */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
            Try asking
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUGGESTIONS.map(({ label, prompt }) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => send(prompt)}
                disabled={loading}
                className="group text-left px-3 py-2.5 rounded-xl bg-white border border-teal-200/80 text-teal-900 shadow-sm hover:border-teal-400 hover:shadow-md hover:bg-teal-50/50 transition-all disabled:opacity-50"
              >
                <span className="block text-xs font-bold text-teal-600 group-hover:text-teal-700">
                  {label}
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">
                  {prompt}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat thread */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Market Buddy conversation"
          className="rounded-2xl bg-white/90 border border-slate-200/90 shadow-inner max-h-[min(26rem,55vh)] overflow-y-auto overflow-x-hidden p-4 space-y-4 overscroll-contain"
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={i}
                className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {!isUser && <BuddyAvatar size="sm" />}
                <div
                  className={`min-w-0 max-w-[min(100%,28rem)] ${
                    isUser ? 'ml-8' : 'mr-2'
                  }`}
                >
                  {!isUser && (
                    <p className="text-[11px] font-bold text-teal-700 mb-1 ml-0.5">Market Buddy</p>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-3 ${
                      isUser
                        ? 'bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-br-md shadow-md shadow-teal-500/20'
                        : 'bg-slate-50 border border-slate-200/90 text-slate-800 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <ChatMessageBody text={msg.text} />
                    )}
                    {msg.disclaimer && (
                      <p
                        className={`text-[10px] mt-3 pt-2.5 border-t leading-snug ${
                          isUser
                            ? 'border-teal-400/40 text-teal-50'
                            : 'border-slate-200 text-slate-500'
                        }`}
                      >
                        {msg.disclaimer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2.5 pl-1">
              <BuddyAvatar size="sm" />
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
                <Spinner />
                <span>Reading latest scrape…</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-teal-400/40 focus-within:border-teal-300 transition-shadow">
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
              placeholder="Ask about movers, headlines, or risks in the last file…"
              className="flex-1 px-3 py-2.5 rounded-xl border-0 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-sm sm:text-[0.9375rem]"
              disabled={loading}
              maxLength={2000}
              aria-label="Your question for Market Buddy"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="btn-primary shrink-0 px-6 py-2.5 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Wait…' : 'Ask'}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 text-center leading-relaxed flex flex-wrap justify-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden />
            Powered by Groq
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden>
            |
          </span>
          <span>Same data as news &amp; movers panels — sparse files → shorter answers</span>
        </p>
      </div>
    </section>
  );
}

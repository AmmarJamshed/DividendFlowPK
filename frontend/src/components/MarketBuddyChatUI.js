import { Fragment } from 'react';
import { useMarketBuddy } from '../context/MarketBuddyContext';

function Spinner() {
  return (
    <div
      className="w-5 h-5 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin shrink-0"
      aria-hidden
    />
  );
}

function BuddyAvatar({ size = 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div
      className={`${dim} shrink-0 rounded-xl bg-gradient-to-br from-teal-500 to-violet-500 text-white font-bold flex items-center justify-center shadow-md shadow-teal-300/40`}
      aria-hidden
    >
      MB
    </div>
  );
}

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
            <ul key={bi} className="list-disc pl-5 space-y-1 marker:text-neutral-400">
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

/**
 * @param {'page' | 'drawer'} variant — full dashboard section or header slide-over
 */
export default function MarketBuddyChatUI({ variant = 'page', onClose }) {
  const isDrawer = variant === 'drawer';
  const { input, setInput, messages, loading, send, scrollRef, inputRef, suggestions, exchange, exchangeConfig } =
    useMarketBuddy();

  const threadMaxH = isDrawer ? 'max-h-[min(20rem,40vh)]' : 'max-h-[min(26rem,55vh)]';

  const inner = (
    <>
      <div
        className={`fin-hero fin-hero--teal px-4 sm:px-5 py-4 border-b border-teal-400/30 ${
          isDrawer ? 'rounded-none shrink-0' : 'rounded-none border-x-0 border-t-0'
        }`}
      >
        <div className="flex items-start gap-3">
          <BuddyAvatar />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-100 mb-0.5">
              {isDrawer ? 'Market Buddy' : 'Research assistant · +20 XP'}
            </p>
            <h2 className={`font-bold tracking-tight leading-tight text-white ${isDrawer ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
              {isDrawer ? `Ask about ${exchange} data` : `${exchangeConfig.name} research chat`}
            </h2>
            {!isDrawer && (
              <p className="mt-2 text-sm text-teal-50/95 leading-relaxed max-w-2xl">
                Query archived {exchange} prices, dividends, and database insights for {exchangeConfig.currency} markets.
                Outputs are research-only — not buy/sell advice.
                generated summaries — not live quotes or investment recommendations.
              </p>
            )}
          </div>
          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg bg-white/15 text-white hover:bg-white/25 text-xl leading-none"
              aria-label="Close chat"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {!isDrawer && (
        <div className="px-5 sm:px-6 py-3 bg-neutral-50 border-b border-neutral-200">
          <p className="text-xs text-neutral-600 leading-relaxed">
            <span className="font-semibold text-neutral-800">Disclaimer:</span> Answers use Supabase + scrape archives
            only. Research ideas — not buy/sell advice.
          </p>
        </div>
      )}

      <div className={`p-4 space-y-4 bg-white ${isDrawer ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : 'sm:p-6'}`}>
        <div className={isDrawer ? 'shrink-0' : ''}>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Try asking</p>
          <div className={`grid gap-2 ${isDrawer ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {suggestions.map(({ label, prompt }) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => send(prompt)}
                disabled={loading}
                className="group text-left px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors disabled:opacity-50 text-xs"
              >
                <span className="block font-semibold text-slate-800 group-hover:text-teal-700">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Market Buddy conversation"
          className={`border border-neutral-200 bg-neutral-50 overflow-y-auto overflow-x-hidden p-3 space-y-3 overscroll-contain ${threadMaxH} ${
            isDrawer ? 'flex-1 min-h-0' : ''
          }`}
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isUser && <BuddyAvatar size="sm" />}
                <div className={`min-w-0 max-w-[min(100%,24rem)] ${isUser ? 'ml-4' : 'mr-1'}`}>
                  {!isUser && (
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Buddy</p>
                      {typeof msg.confidence === 'number' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200">
                          Data confidence {msg.confidence}/100
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={`px-3 py-2.5 rounded-xl ${
                      isUser
                        ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white'
                        : 'bg-white border border-neutral-200 text-neutral-800'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <ChatMessageBody text={msg.text} />
                    )}
                    {msg.disclaimer && (
                      <p className="text-[10px] mt-2 pt-2 border-t border-slate-200 text-slate-500 leading-snug">
                        {msg.disclaimer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 pl-1">
              <BuddyAvatar size="sm" />
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <Spinner />
                <span>Querying database and scrapes…</span>
              </div>
            </div>
          )}
        </div>

        <div className={`border border-slate-200 bg-white p-2 rounded-xl focus-within:ring-2 focus-within:ring-teal-400/40 shrink-0`}>
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
              placeholder="Ask about movers or headlines…"
              className="flex-1 px-3 py-2 rounded-lg border-0 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-sm"
              disabled={loading}
              maxLength={2000}
              aria-label="Your question for Market Buddy"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="btn-primary shrink-0 px-5 py-2 text-sm disabled:opacity-50"
            >
              {loading ? 'Wait…' : 'Ask'}
            </button>
          </div>
        </div>

        {!isDrawer && (
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Same data as news &amp; movers panels — sparse files → shorter answers
          </p>
        )}
      </div>
    </>
  );

  if (isDrawer) {
    return <div className="flex flex-col h-full min-h-0 bg-white">{inner}</div>;
  }

  return (
    <section
      id="market-chat"
      className="section-zone section-zone--chat p-0 overflow-hidden scroll-mt-24"
      data-ai-hint="Research chat on stocks from the latest saved news and prices"
    >
      <span className="section-zone-tag mx-5 mt-4 mb-0">Market research chat</span>
      {inner}
    </section>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import MarketBuddyChatUI from '../components/MarketBuddyChatUI';

const MarketBuddyContext = createContext(null);

export function useMarketBuddy() {
  const ctx = useContext(MarketBuddyContext);
  if (!ctx) {
    throw new Error('useMarketBuddy must be used within MarketBuddyProvider');
  }
  return ctx;
}

export function MarketBuddyProvider({ children }) {
  const { exchange, exchangeConfig } = useExchange();

  function buildWelcome() {
    return `Hi — I'm **Market Buddy** for **PSX only**. I use DividendFlow's PSX scrapes and database (prices, dividends, news). Short answers — research ideas, not buy/sell advice.`;
  }

  function buildSuggestions() {
    return [
      { label: 'Top movers', prompt: 'Which PSX stocks led gains and losses in the latest close? Keep it brief.' },
      { label: 'Dividend picks', prompt: 'Top 5 PSX dividend yields from our database — symbol and yield only.' },
      { label: 'Sentiment', prompt: 'One-paragraph PSX market mood from scraped news tone.' },
      { label: 'Portfolio', prompt: 'I hold OGDC, HBL, ENGRO — quick diversification check from PSX data.' },
    ];
  }

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: '' }]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const scrollLockRef = useRef(null);

  const suggestions = useMemo(() => buildSuggestions(), []);

  useEffect(() => {
    setMessages([{ role: 'assistant', text: buildWelcome() }]);
    setInput('');
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

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

  const send = useCallback(
    async (text) => {
      const q = (text || input).trim();
      if (!q || loading) return;
      capturePageScroll();
      setInput('');
      setMessages((m) => [...m, { role: 'user', text: q }]);
      setLoading(true);
      try {
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text }));
        const { data } = await api.postMarketChat({ message: q, exchange: 'PSX', history });
        const reply = data.reply || 'No answer came back.';
        capturePageScroll();
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: reply,
            disclaimer: data.disclaimer,
            confidence: data.confidence ?? data.confidenceHint,
            intent: data.intent,
          },
        ]);
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
    },
    [input, loading, messages]
  );

  const value = {
    open,
    setOpen,
    toggle,
    close,
    input,
    setInput,
    messages,
    loading,
    send,
    scrollRef,
    inputRef,
    suggestions,
    exchange,
    exchangeConfig,
  };

  return (
    <MarketBuddyContext.Provider value={value}>
      {children}
      <MarketBuddyDrawer />
    </MarketBuddyContext.Provider>
  );
}

function MarketBuddyDrawer() {
  const { open, close } = useMarketBuddy();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none lg:pointer-events-none"
        aria-label="Close Market Buddy"
        onClick={close}
      />
      <aside
        className="fixed top-14 right-0 z-[70] flex flex-col w-full max-w-md h-[calc(100vh-3.5rem)] bg-white border-l-2 border-blue-300 shadow-2xl shadow-blue-200/40 animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Market Buddy chat"
      >
        <MarketBuddyChatUI variant="drawer" onClose={close} />
      </aside>
    </>
  );
}


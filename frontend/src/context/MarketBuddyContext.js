import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import MarketBuddyChatUI from '../components/MarketBuddyChatUI';

const WELCOME =
  "Hi — I'm Market Buddy. Ask about movers, dividends, and headlines from DividendFlow's database across PSX and global markets. I summarize saved data only — not live prices or personal investment advice.";

const SUGGESTIONS = [
  { label: 'Top gainers', prompt: 'Which stocks led gains in the latest scrape?' },
  { label: 'Top decliners', prompt: 'Which names declined most in the saved data?' },
  { label: 'News themes', prompt: 'Summarize constructive signals from the news file.' },
  { label: 'Risk flags', prompt: 'Any names the commentary flags as stressed or risky?' },
];

const MarketBuddyContext = createContext(null);

export function useMarketBuddy() {
  const ctx = useContext(MarketBuddyContext);
  if (!ctx) {
    throw new Error('useMarketBuddy must be used within MarketBuddyProvider');
  }
  return ctx;
}

export function MarketBuddyProvider({ children }) {
  const { exchange } = useExchange();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const scrollLockRef = useRef(null);

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
        const { data } = await api.postMarketChat({ message: q, exchange });
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
    },
    [input, loading, exchange]
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
    suggestions: SUGGESTIONS,
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

export { SUGGESTIONS, WELCOME };

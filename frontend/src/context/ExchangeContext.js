import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { DEFAULT_EXCHANGE, getExchange } from '../config/exchanges';

const STORAGE_KEY = 'dividendflow_exchange';

const ExchangeContext = createContext(null);

export function ExchangeProvider({ children }) {
  const [exchange, setExchangeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_EXCHANGE;
    } catch {
      return DEFAULT_EXCHANGE;
    }
  });

  const setExchange = useCallback((code) => {
    const c = String(code || DEFAULT_EXCHANGE).toUpperCase();
    setExchangeState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      exchange,
      exchangeConfig: getExchange(exchange),
      setExchange,
    }),
    [exchange, setExchange]
  );

  return <ExchangeContext.Provider value={value}>{children}</ExchangeContext.Provider>;
}

export function useExchange() {
  const ctx = useContext(ExchangeContext);
  if (!ctx) throw new Error('useExchange must be used within ExchangeProvider');
  return ctx;
}

export function getWatchlistSessionId() {
  const KEY = 'dividendflow_watchlist_session';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `wl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `wl_anon_${Date.now()}`;
  }
}

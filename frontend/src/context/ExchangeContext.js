import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { DEFAULT_EXCHANGE, getExchange } from '../config/exchanges';

const STORAGE_KEY = 'dividendflow_exchange';

const ExchangeContext = createContext(null);

export function ExchangeProvider({ children }) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, DEFAULT_EXCHANGE);
    } catch {
      /* ignore */
    }
  }, []);

  const setExchange = useCallback(() => {
    /* PSX-only mode — exchange switching disabled */
  }, []);

  const value = useMemo(
    () => ({
      exchange: DEFAULT_EXCHANGE,
      exchangeConfig: getExchange(DEFAULT_EXCHANGE),
      setExchange,
    }),
    [setExchange]
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

import { createContext, useContext, useState, useEffect } from 'react';

const AIAssistanceContext = createContext(null);
const STORAGE_KEY = 'dividendflow_ai_assistance';

export function AIAssistanceProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled]);

  return (
    <AIAssistanceContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </AIAssistanceContext.Provider>
  );
}

export function useAIAssistance() {
  const ctx = useContext(AIAssistanceContext);
  if (!ctx) {
    throw new Error('useAIAssistance must be used within AIAssistanceProvider');
  }
  return ctx;
}

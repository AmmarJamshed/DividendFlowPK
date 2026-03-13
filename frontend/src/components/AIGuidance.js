import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_TIPS = {
  '/': [
    'Check the AI Market Summary for today\'s PSX overview.',
    'Use the Dividend Calendar to see upcoming payouts.',
    'Add holdings in Portfolio to estimate dividend income.',
  ],
  '/dividend-calendar': [
    'Click Dividend Calendar to see upcoming payouts.',
    'Use the search bar to find a company quickly.',
    'Check Interim/Final column for dividend type.',
  ],
  '/weak-month-optimizer': [
    'Use Weak Month Optimizer to balance dividend income across months.',
    'Add your holdings to see which months need more coverage.',
  ],
  '/ai-risk-dashboard': [
    'Review AI risk scores before adding new positions.',
    'Compare risk levels across your portfolio.',
  ],
  '/forecast-engine': [
    'Use Forecast Engine to project future dividend income.',
    'Select a company and date range for estimates.',
  ],
  '/salary-simulator': [
    'Use the Salary Replacement Simulator to plan passive income goals.',
    'Set your target monthly income and expected yield.',
  ],
  '/reporting-cycles': [
    'Check PSX Reporting Cycles for earnings dates.',
    'Plan around quarter-end announcements.',
  ],
  '/market-closing-prices': [
    'Check Market Closing Prices to see today\'s PSX performance.',
    'Sort columns to find top gainers and losers.',
    'Use the search bar to find a stock quickly.',
  ],
};

const DEFAULT_TIPS = [
  'Use the search bar to find a company quickly.',
  'Check the Dividend Calendar for upcoming payouts.',
  'Add your holdings in Portfolio to estimate dividend income.',
];

function RobotIcon({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <rect x="12" y="20" width="40" height="36" rx="6" fill="#1e293b" stroke="#2dd4bf" strokeWidth="2" />
      <text x="32" y="42" textAnchor="middle" fill="#2dd4bf" fontSize="14" fontWeight="bold" fontFamily="system-ui">₨</text>
      <rect x="18" y="8" width="28" height="16" rx="4" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.5" />
      <circle cx="24" cy="16" r="2.5" fill="#2dd4bf" />
      <circle cx="40" cy="16" r="2.5" fill="#2dd4bf" />
      <line x1="32" y1="8" x2="32" y2="2" stroke="#2dd4bf" strokeWidth="1.5" />
      <circle cx="32" cy="2" r="2" fill="#2dd4bf" />
    </svg>
  );
}

export default function AIGuidance() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [input, setInput] = useState('');
  const location = useLocation();

  const tips = ROUTE_TIPS[location.pathname] || DEFAULT_TIPS;

  useEffect(() => {
    if (open && !message && tips.length) {
      setMessage(tips[Math.floor(Math.random() * tips.length)]);
    }
  }, [open, location.pathname, message, tips.length]);

  const handleSend = () => {
    const q = (input || '').trim().toLowerCase();
    if (!q) return;
    const responses = {
      calendar: 'Go to Dividend Calendar to see upcoming payouts.',
      dividend: 'Check the Dividend Calendar or Portfolio tab for dividend information.',
      portfolio: 'Use the Portfolio tab to add holdings and estimate dividend income.',
      market: 'Check Market Closing Prices for today\'s PSX performance.',
      search: 'Use the search bar at the top to find a company quickly.',
      price: 'Market Closing Prices shows daily close, change %, and volume.',
      gainer: 'Sort the Market Closing Prices table by Daily % to find top gainers.',
      loser: 'Sort the Market Closing Prices table by Daily % to find worst performers.',
    };
    const key = Object.keys(responses).find(k => q.includes(k));
    setMessage(key ? responses[key] : 'I can help you navigate DividendFlow. Try asking about: Dividend Calendar, Portfolio, Market Closing Prices, or Search.');
    setInput('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex flex-col items-end gap-2">
      {open && (
        <div className="w-80 sm:w-96 rounded-2xl bg-slate-900/98 backdrop-blur-xl border border-slate-700/50 shadow-2xl overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2 bg-slate-800/50">
            <RobotIcon className="w-8 h-8" />
            <span className="font-semibold text-teal-300">AI Assistant</span>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <p className="text-sm text-slate-300">{message || tips[0]}</p>
          </div>
          <div className="p-3 border-t border-slate-700/50 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask something..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
            <button
              onClick={handleSend}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg hover:shadow-teal-500/30 hover:scale-105 transition-all flex items-center justify-center"
        aria-label="Toggle AI Assistant"
      >
        <RobotIcon className="w-8 h-8" />
      </button>
    </div>
  );
}

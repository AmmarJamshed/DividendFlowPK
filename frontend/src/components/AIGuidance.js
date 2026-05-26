import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_TIPS = {
  '/': [
    'Check the AI Market Summary for today\'s PSX overview.',
    'Use the Dividend Calendar to see upcoming payouts.',
    'Add holdings in Portfolio to estimate dividend income.',
  ],
  '/dividend-calendar': [
    'Use the Dividend Calculator to enter holdings or upload a portfolio PDF.',
    'See estimated dividend cash by payment month for your stocks.',
    'Click a month on the calendar to see every payout and weak-month analysis.',
    'Weak months show ideas to spread dividend income across the year.',
    'Check Interim vs Final in the table for each payment.',
  ],
  '/forecast-engine': [
    'Review volatility-based price bands and the blended return worksheet for a symbol.',
    'Select a company and date range for estimates.',
  ],
  '/salary-simulator': [
    'Use the Salary Replacement Simulator to plan passive income goals.',
    'After Calculate, AI suggests how many PSX stocks and how to split your portfolio using today\'s news.',
    'Set your target monthly income and expected yield.',
  ],
  '/reporting-cycles': [
    'Check PSX Reporting Cycles for earnings dates.',
    'Plan around quarter-end announcements.',
  ],
  '/market-closing-prices': [
    'Check Market Closing Prices to see today\'s PSX performance.',
    'Use Shariah compliant only to filter against the official PSX disclosure list.',
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
    <svg viewBox="0 0 64 64" width="32" height="32" className={className}>
      <rect x="12" y="20" width="40" height="36" rx="6" fill="#0d9488" stroke="#14b8a6" strokeWidth="2" />
      <text x="32" y="42" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="system-ui">₨</text>
      <rect x="18" y="8" width="28" height="16" rx="4" fill="#0f766e" stroke="#14b8a6" strokeWidth="1.5" />
      <circle cx="24" cy="16" r="2.5" fill="white" />
      <circle cx="40" cy="16" r="2.5" fill="white" />
      <line x1="32" y1="8" x2="32" y2="2" stroke="#14b8a6" strokeWidth="1.5" />
      <circle cx="32" cy="2" r="2" fill="#14b8a6" />
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
    <div
      data-ammar-ignore
      className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-[9998] flex flex-col items-end gap-2 pointer-events-none [&>*]:pointer-events-auto"
    >
      {open && (
        <div className="w-80 sm:w-96 bg-white border border-neutral-200 shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2 bg-neutral-50">
            <RobotIcon className="w-7 h-7 shrink-0" />
            <span className="font-semibold text-neutral-900 text-sm">Site guide</span>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <p className="text-sm text-slate-600">{message || tips[0]}</p>
          </div>
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask something..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
            />
            <button
              onClick={handleSend}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 sm:w-11 sm:h-11 bg-neutral-900 hover:bg-neutral-800 transition-colors flex items-center justify-center border border-neutral-800"
        aria-label="Toggle Ammar quick tips"
      >
        <RobotIcon className="w-[22px] h-[22px] sm:w-6 sm:h-6" />
      </button>
    </div>
  );
}

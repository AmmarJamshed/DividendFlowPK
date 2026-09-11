import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const THEME = `${process.env.PUBLIC_URL || ''}/theme/avatars`;

const CAST = {
  overview: { file: 'nav-overview.png', name: 'Captain Flow' },
  dividends: { file: 'nav-dividends.png', name: 'Coin Catcher' },
  market: { file: 'nav-market.png', name: 'Chart Rider' },
  ipo: { file: 'nav-ipo.png', name: 'Launch Ace' },
  forecast: { file: 'nav-forecast.png', name: 'Signal Scout' },
  income: { file: 'nav-income.png', name: 'AI Buddy' },
  reporting: { file: 'nav-reporting.png', name: 'Study Star' },
  brokers: { file: 'nav-brokers.png', name: 'Flag Flyer' },
  us: { file: 'nav-us.png', name: 'Challenger' },
  cheer: { file: 'nav-cheer.png', name: 'Hype Hero' },
};

const ROUTE_SCENES = [
  {
    test: (p) => p === '/' || p.startsWith('/stock'),
    left: 'overview',
    right: 'cheer',
    tip: 'Tap a card or search a ticker — we track the market together!',
    point: 'center',
  },
  {
    test: (p) => p.startsWith('/dividend-calendar'),
    left: 'dividends',
    right: 'income',
    tip: 'Add your shares, then hit Calculate — or click a month to hunt payouts!',
    point: 'calculator',
  },
  {
    test: (p) => p.startsWith('/market-closing-prices'),
    left: 'market',
    right: 'forecast',
    tip: 'Watch Top Gainers & Losers — green means up, red means down!',
    point: 'movers',
  },
  {
    test: (p) => p.startsWith('/ipo-calendar'),
    left: 'ipo',
    right: 'cheer',
    tip: 'IPO calendar = new company launches. Countdown vibes!',
    point: 'list',
  },
  {
    test: (p) => p.startsWith('/forecast-engine'),
    left: 'forecast',
    right: 'reporting',
    tip: 'Forecast mode: peek ahead, but remember — not buy/sell advice.',
    point: 'center',
  },
  {
    test: (p) => p.startsWith('/salary-simulator'),
    left: 'income',
    right: 'dividends',
    tip: 'Income planner turns dividends into a salary-style story.',
    point: 'center',
  },
  {
    test: (p) => p.startsWith('/reporting-cycles'),
    left: 'reporting',
    right: 'overview',
    tip: 'Reporting cycles show when companies publish results.',
    point: 'list',
  },
  {
    test: (p) => p.startsWith('/market-brokers'),
    left: 'brokers',
    right: 'us',
    tip: 'Compare brokers — then open an account the safe, licensed way.',
    point: 'list',
  },
];

const CLICK_REACTIONS = [
  {
    match: (t) => /calculate|dividend calculator/i.test(t),
    mood: 'celebrate',
    tip: 'Nice! Calculating your dividend loot…',
    left: 'dividends',
    right: 'income',
  },
  {
    match: (t) => /upload pdf|manual entry/i.test(t),
    mood: 'think',
    tip: 'Upload a PDF or type tickers — both paths work!',
    left: 'reporting',
    right: 'dividends',
  },
  {
    match: (t) => /add row/i.test(t),
    mood: 'cheer',
    tip: 'More holdings = bigger adventure. Add another ticker!',
    left: 'cheer',
    right: 'dividends',
  },
  {
    match: (t) => /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|payouts|weak month|stronger coverage/i.test(t),
    mood: 'point',
    tip: 'Month selected! Scroll the table for who pays when.',
    left: 'dividends',
    right: 'cheer',
  },
  {
    match: (t) => /market buddy|asi/i.test(t),
    mood: 'celebrate',
    tip: 'Ask the AI helpers anything about this screen!',
    left: 'income',
    right: 'overview',
  },
  {
    match: (t) => /gainer|loser|shariah|change %|company cards/i.test(t),
    mood: 'point',
    tip: 'Sorting the board — keep an eye on big movers!',
    left: 'market',
    right: 'forecast',
  },
  {
    match: (t) => /overview|dividend calendar|market data|ipo|forecast|income|reporting|broker|us stock/i.test(t),
    mood: 'cheer',
    tip: 'Quest change! New page, new tips — follow the arrows.',
    left: 'overview',
    right: 'cheer',
  },
];

function sceneForPath(pathname) {
  return ROUTE_SCENES.find((s) => s.test(pathname)) || ROUTE_SCENES[0];
}

function labelFromEventTarget(target) {
  if (!target || target.nodeType !== 1) return '';
  const hint = target.closest?.('[data-guide-hint]')?.getAttribute('data-guide-hint');
  if (hint) return hint;
  const el = target.closest?.('a, button, [role="button"], label, th, td, input, select');
  if (!el) return (target.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const aria = el.getAttribute('aria-label') || '';
  const title = el.getAttribute('title') || '';
  const text = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
  return `${aria} ${title} ${text}`.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function GuideBubble({ side, tip, mood }) {
  return (
    <div
      className={`df-challenger-bubble df-challenger-bubble--${side} df-challenger-bubble--${mood}`}
      role="status"
      aria-live="polite"
    >
      <p>{tip}</p>
    </div>
  );
}

function GuideFigure({ castKey, side, mood, tip }) {
  const cast = CAST[castKey] || CAST.overview;
  return (
    <div className={`df-challenger-figure df-challenger-figure--${side} df-challenger-figure--${mood}`}>
      <GuideBubble side={side} tip={tip} mood={mood} />
      <div className="df-challenger-avatar-wrap">
        <img
          src={`${THEME}/${cast.file}`}
          alt=""
          className="df-challenger-avatar"
          draggable={false}
        />
        <span className="df-challenger-name">{cast.name}</span>
      </div>
      <div className={`df-challenger-pointer df-challenger-pointer--${side}`} aria-hidden>
        <span className="df-challenger-pointer__arm" />
        <span className="df-challenger-pointer__tip" />
      </div>
    </div>
  );
}

/**
 * Desktop side mascots — point at key UI and react to clicks for a gamified tour.
 */
export default function ChallengersSideGuides() {
  const location = useLocation();
  const base = useMemo(() => sceneForPath(location.pathname), [location.pathname]);
  const [reaction, setReaction] = useState(null);

  useEffect(() => {
    setReaction(null);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e) => {
      if (e.target?.closest?.('.df-challengers-rail')) return;
      const hinted = e.target?.closest?.('[data-guide-hint]');
      const text = labelFromEventTarget(e.target);
      if (!text || text.length < 2) return;
      const hit = CLICK_REACTIONS.find((r) => r.match(text));
      // Only react to guided targets or known hotspots — avoid noise on every click.
      if (!hit && !hinted) return;
      setReaction(
        hit || {
          mood: 'think',
          tip: `Nice pick — “${text.slice(0, 36)}${text.length > 36 ? '…' : ''}” is on the board!`,
          left: base.left,
          right: base.right,
        }
      );
      window.clearTimeout(onClick._t);
      onClick._t = window.setTimeout(() => setReaction(null), 5200);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(onClick._t);
    };
  }, [base.left, base.right]);

  const left = reaction?.left || base.left;
  const right = reaction?.right || base.right;
  const mood = reaction?.mood || 'idle';
  const tip = reaction?.tip || base.tip;

  return (
    <aside className="df-challengers-rail" aria-hidden="false" data-ammar-ignore="true">
      <div className="df-challengers-rail__inner">
        <GuideFigure castKey={left} side="left" mood={mood} tip={tip} />
        <GuideFigure
          castKey={right}
          side="right"
          mood={mood}
          tip={reaction ? tip : 'Follow the glow — important stuff sits in the middle!'}
        />
      </div>
    </aside>
  );
}

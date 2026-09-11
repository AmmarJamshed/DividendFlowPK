import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const THEME_ROOT = `${process.env.PUBLIC_URL || ''}/theme`;
const AVATARS = `${THEME_ROOT}/avatars`;

const SCENE_BY_ROUTE = [
  {
    test: (p) => p === '/' || p.startsWith('/stock'),
    art: 'dfpk-theme-01-title.png',
    floaters: ['nav-overview.png', 'nav-cheer.png', 'nav-dividends.png'],
    accent: '#1e3a8a',
  },
  {
    test: (p) => p.startsWith('/dividend-calendar'),
    art: 'dfpk-theme-04-dividends.png',
    floaters: ['nav-dividends.png', 'nav-income.png', 'nav-cheer.png'],
    accent: '#f97316',
  },
  {
    test: (p) => p.startsWith('/market-closing-prices'),
    art: 'dfpk-theme-02-race.png',
    floaters: ['nav-market.png', 'nav-forecast.png', 'nav-cheer.png'],
    accent: '#16a34a',
  },
  {
    test: (p) => p.startsWith('/ipo-calendar'),
    art: 'dfpk-theme-03-ipo.png',
    floaters: ['nav-ipo.png', 'nav-cheer.png', 'nav-overview.png'],
    accent: '#f59e0b',
  },
  {
    test: (p) => p.startsWith('/forecast-engine'),
    art: 'dfpk-theme-02-race.png',
    floaters: ['nav-forecast.png', 'nav-reporting.png', 'nav-market.png'],
    accent: '#3b82f6',
  },
  {
    test: (p) => p.startsWith('/salary-simulator'),
    art: 'dfpk-theme-04-dividends.png',
    floaters: ['nav-income.png', 'nav-dividends.png', 'nav-cheer.png'],
    accent: '#f97316',
  },
  {
    test: (p) => p.startsWith('/reporting-cycles'),
    art: 'dfpk-theme-05-finale.png',
    floaters: ['nav-reporting.png', 'nav-overview.png', 'nav-forecast.png'],
    accent: '#1e3a8a',
  },
  {
    test: (p) => p.startsWith('/market-brokers'),
    art: 'dfpk-theme-05-finale.png',
    floaters: ['nav-brokers.png', 'nav-us.png', 'nav-cheer.png'],
    accent: '#f97316',
  },
];

const DEFAULT_SCENE = {
  art: 'dfpk-theme-05-finale.png',
  floaters: ['nav-cheer.png', 'nav-overview.png', 'nav-dividends.png'],
  accent: '#1e3a8a',
};

const FLOAT_SLOTS = [
  { side: 'left', top: '12%', size: 132, delay: '0s', drift: 'a' },
  { side: 'left', top: '42%', size: 108, delay: '1.1s', drift: 'b' },
  { side: 'left', top: '68%', size: 96, delay: '2.2s', drift: 'c' },
  { side: 'right', top: '16%', size: 128, delay: '0.4s', drift: 'b' },
  { side: 'right', top: '48%', size: 112, delay: '1.6s', drift: 'a' },
  { side: 'right', top: '72%', size: 100, delay: '2.8s', drift: 'c' },
];

const COIN_COUNT = 14;

function sceneForPath(pathname) {
  return SCENE_BY_ROUTE.find((s) => s.test(pathname)) || DEFAULT_SCENE;
}

/**
 * Full-viewport Challengers wallpaper — fills empty page margins with theme art,
 * floating cast, and light motion. Decorative only (pointer-events: none).
 */
export default function ChallengersWallpaper() {
  const location = useLocation();
  const scene = useMemo(() => sceneForPath(location.pathname), [location.pathname]);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const onClick = () => {
      setPulse(true);
      window.clearTimeout(onClick._t);
      onClick._t = window.setTimeout(() => setPulse(false), 700);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(onClick._t);
    };
  }, []);

  const floaterFiles = useMemo(() => {
    const base = scene.floaters || DEFAULT_SCENE.floaters;
    return FLOAT_SLOTS.map((_, i) => base[i % base.length]);
  }, [scene.floaters]);

  return (
    <div
      className={`df-challengers-wallpaper${pulse ? ' df-challengers-wallpaper--pulse' : ''}`}
      aria-hidden="true"
      style={{ '--df-wallpaper-accent': scene.accent }}
    >
      <div
        className="df-challengers-wallpaper__art df-challengers-wallpaper__art--left"
        style={{ backgroundImage: `url(${THEME_ROOT}/${scene.art})` }}
      />
      <div
        className="df-challengers-wallpaper__art df-challengers-wallpaper__art--right"
        style={{ backgroundImage: `url(${THEME_ROOT}/${scene.art})` }}
      />
      <div
        className="df-challengers-wallpaper__hero"
        style={{ backgroundImage: `url(${THEME_ROOT}/${scene.art})` }}
      />
      <div className="df-challengers-wallpaper__wash" />
      <div className="df-challengers-wallpaper__grid" />

      <div className="df-challengers-wallpaper__floaters">
        {FLOAT_SLOTS.map((slot, i) => (
          <img
            key={`${slot.side}-${slot.top}`}
            src={`${AVATARS}/${floaterFiles[i]}`}
            alt=""
            className={`df-challengers-floater df-challengers-floater--${slot.side} df-challengers-floater--${slot.drift}`}
            style={{
              top: slot.top,
              width: slot.size,
              height: slot.size,
              animationDelay: slot.delay,
              [slot.side]: 'max(0.4rem, calc((100vw - 1200px) / 2 - 8px))',
            }}
            draggable={false}
          />
        ))}
      </div>

      <div className="df-challengers-wallpaper__coins">
        {Array.from({ length: COIN_COUNT }, (_, i) => (
          <span
            key={i}
            className="df-challengers-coin"
            style={{
              left: `${6 + ((i * 7) % 88)}%`,
              animationDelay: `${(i % 7) * 0.55}s`,
              animationDuration: `${7 + (i % 5)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

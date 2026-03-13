import { useEffect, useState, useRef } from 'react';

/**
 * Custom Investment Robot Cursor - friendly mascot with ₨ PKR on chest
 * Replaces default cursor, follows mouse, animates on hover/click
 */
export default function RobotCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hover, setHover] = useState(false);
  const [click, setClick] = useState(false);
  const rafRef = useRef(null);
  const targetRef = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const handleMove = (e) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    const animate = () => {
      const t = targetRef.current;
      setPos(p => ({
        x: p.x + (t.x - p.x) * 0.15,
        y: p.y + (t.y - p.y) * 0.15,
      }));
      rafRef.current = requestAnimationFrame(animate);
    };

    const handleOver = (e) => {
      const el = e.target;
      const clickable = el.closest('a, button, [role="button"], input, select, textarea, [onclick]');
      setHover(!!clickable);
    };

    const handleDown = () => setClick(true);
    const handleUp = () => setTimeout(() => setClick(false), 150);

    window.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseover', handleOver);
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseover', handleOver);
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('mouseup', handleUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <style>{`
        * { cursor: none !important; }
        html, body { cursor: none !important; }
        a, button, input, select, textarea, [role="button"] { cursor: none !important; }
      `}</style>
      <div
        className="fixed pointer-events-none z-[9999] transition-transform duration-75"
        style={{
          left: pos.x,
          top: pos.y,
          transform: `translate(-50%, -50%) scale(${hover ? 1.15 : 1})`,
        }}
      >
        <div
          className={`w-8 h-8 transition-all duration-150 ${
            click ? 'scale-90' : 'scale-100'
          } ${click ? 'shadow-[0_0_20px_rgba(34,197,94,0.8)]' : hover ? 'shadow-[0_0_20px_rgba(45,212,191,0.5)]' : ''}`}
        >
          <svg viewBox="0 0 64 64" className="w-8 h-8 overflow-visible">
            {/* Robot body */}
            <rect x="12" y="20" width="40" height="36" rx="6" fill={click ? '#22c55e' : '#0f172a'} stroke="#2dd4bf" strokeWidth="2" />
            {/* PKR symbol on chest */}
            <text x="32" y="42" textAnchor="middle" fill="#2dd4bf" fontSize="14" fontWeight="bold" fontFamily="system-ui">₨</text>
            {/* Head */}
            <rect x="18" y="8" width="28" height="16" rx="4" fill="#1e293b" stroke="#2dd4bf" strokeWidth="1.5" />
            {/* Eyes */}
            <circle cx="24" cy="16" r="2.5" fill="#2dd4bf" className={hover ? 'animate-pulse' : ''} />
            <circle cx="40" cy="16" r="2.5" fill="#2dd4bf" className={hover ? 'animate-pulse' : ''} />
            {/* Antenna */}
            <line x1="32" y1="8" x2="32" y2="2" stroke="#2dd4bf" strokeWidth="1.5" />
            <circle cx="32" cy="2" r="2" fill="#2dd4bf" />
          </svg>
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAIAssistance } from '../context/AIAssistanceContext';

const DEBOUNCE_MS = 780;
const AVATAR = `${process.env.PUBLIC_URL || ''}/ammar-guide.png`;

function GuideMessageBody({ loading, message, fallback }) {
  if (loading) {
    return <p className="text-[0.9375rem] text-slate-600 leading-relaxed">Taking a look at what you’re hovering over…</p>;
  }
  const raw = (message || '').trim() || fallback;
  const blocks = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return <p className="text-[0.9375rem] text-slate-700 leading-relaxed">{raw}</p>;
  }
  return (
    <div className="space-y-2.5">
      {blocks.map((para, i) => (
        <p key={i} className="text-[0.9375rem] text-slate-700 leading-relaxed first:mt-0">
          {para}
        </p>
      ))}
    </div>
  );
}

function gatherElementContext(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || el.nodeType !== 1) return '';

  let cur = el;
  const chunks = [];
  const seen = new Set();

  for (let depth = 0; depth < 8 && cur && cur !== document.body; depth += 1) {
    if (cur.getAttribute?.('data-ammar-ignore')) {
      return '';
    }

    const hint = cur.getAttribute?.('data-ai-hint');
    if (hint) {
      chunks.push(`Designer hint: ${hint}`);
      break;
    }

    const tag = (cur.tagName || '').toLowerCase();
    const id = cur.id ? `#${cur.id}` : '';
    const role = cur.getAttribute?.('role') || '';
    const aria = cur.getAttribute?.('aria-label') || '';
    const title = cur.getAttribute?.('title') || '';
    const placeholder = cur.getAttribute?.('placeholder') || '';

    if (tag === 'th' || tag === 'td') {
      const table = cur.closest('table');
      if (table && !seen.has('th')) {
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.innerText?.trim()).filter(Boolean);
        if (headers.length) {
          chunks.push(`Table columns: ${headers.slice(0, 12).join(', ')}`);
          seen.add('th');
        }
      }
    }

    let text = (cur.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length > 140) text = `${text.slice(0, 140)}…`;

    const line = [
      tag + id,
      role && `role=${role}`,
      aria && `aria-label="${aria}"`,
      title && `title="${title}"`,
      placeholder && `placeholder="${placeholder}"`,
      text && tag !== 'html' && tag !== 'body' && `visible text: "${text}"`,
    ]
      .filter(Boolean)
      .join(' · ');

    if (line && !seen.has(line)) {
      seen.add(line);
      chunks.push(line);
    }

    cur = cur.parentElement;
  }

  return chunks.slice(0, 10).join('\n');
}

export default function AmmarCursorGuide() {
  const { enabled } = useAIAssistance();
  const location = useLocation();
  const [pos, setPos] = useState({ x: -200, y: -200 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const targetRef = useRef({ x: -200, y: -200 });
  const rafRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const lastSentRef = useRef('');

  useEffect(() => {
    lastSentRef.current = '';
  }, [location.pathname]);

  useEffect(() => {
    if (!enabled) {
      setMessage('');
      setLoading(false);
      lastSentRef.current = '';
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      return undefined;
    }

    const animate = () => {
      setPos((p) => {
        const t = targetRef.current;
        return {
          x: p.x + (t.x - p.x) * 0.18,
          y: p.y + (t.y - p.y) * 0.18,
        };
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const scheduleHint = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { x, y } = targetRef.current;
        if (x < 0 || y < 0) return;

        const elementContext = gatherElementContext(x, y);
        const path = location.pathname;
        const pageTitle = document.title || '';

        const fingerprint = `${path}|${elementContext.slice(0, 400)}`;
        if (fingerprint === lastSentRef.current) {
          return;
        }

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setLoading(true);
        lastSentRef.current = fingerprint;

        try {
          const { data } = await api.postSiteGuide(
            {
              path,
              pageTitle,
              elementContext: elementContext || '(general page area)',
            },
            { signal: ac.signal }
          );
          if (!ac.signal.aborted) {
            setMessage(data.message || '');
          }
        } catch (err) {
          if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.message === 'canceled') {
            return;
          }
          const msg = err.response?.data?.message || err.response?.data?.error;
          if (err.response?.status === 429) {
            setMessage(typeof msg === 'string' ? msg : 'Give me a moment — pause again in a second or two.');
          } else {
            setMessage(typeof msg === 'string' ? msg : 'Could not reach the guide. Check your connection and try again.');
          }
        } finally {
          if (!ac.signal.aborted) {
            setLoading(false);
          }
        }
      }, DEBOUNCE_MS);
    };

    const onMove = (e) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
      scheduleHint();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [enabled, location.pathname]);

  if (!enabled) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const bubbleW = Math.min(360, vw - 24);
  const pad = 12;
  let left = pos.x + 56;
  let top = pos.y - 100;
  if (left + bubbleW + pad > vw) {
    left = Math.max(pad, pos.x - bubbleW - 56);
  }
  left = Math.min(Math.max(pad, left), vw - bubbleW - pad);
  top = Math.min(Math.max(pad, top), vh - 200);

  return (
    <>
      <div
        className="fixed z-[10000] pointer-events-none flex flex-col items-start gap-1"
        style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
        aria-hidden="true"
      >
        <img
          src={AVATAR}
          alt=""
          className="w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-full border-[3px] border-teal-400 shadow-xl shadow-teal-500/20 object-cover ring-2 ring-white/90"
        />
        <span className="text-[10px] font-bold text-teal-700 bg-white/95 px-2 py-0.5 rounded-lg border border-teal-200/80 shadow-sm whitespace-nowrap -mt-1">
          Ammar
        </span>
      </div>

      <div
        className="fixed z-[9999] pointer-events-none w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl bg-white/97 backdrop-blur-md border border-slate-200/90 shadow-xl shadow-slate-400/20 overflow-hidden"
        style={{ left, top }}
      >
        <div className="border-l-4 border-teal-500 bg-gradient-to-br from-teal-50/80 to-white px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Ammar</p>
          <p className="text-xs text-slate-500 mb-2.5">Your guide on DividendFlow PK</p>
          <GuideMessageBody
            loading={loading}
            message={message}
            fallback="Move around the page and pause — I’ll explain what you’re looking at, using the same data the site shows you."
          />
        </div>
      </div>
    </>
  );
}

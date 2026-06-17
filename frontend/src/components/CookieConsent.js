import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'dividendflow_cookie_consent';

function grantAdConsent() {
  if (!window.gtag) return;
  window.gtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted' && window.gtag) {
        grantAdConsent();
        setVisible(false);
        return;
      }
      if (!stored) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
      grantAdConsent();
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const decline = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'essential');
      if (window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        });
      }
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] p-4 sm:p-5 pointer-events-none"
      role="dialog"
      aria-label="Cookie notice"
    >
      <div className="max-w-3xl mx-auto pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl shadow-slate-300/30 p-4 sm:p-5">
        <p className="text-sm text-slate-700 leading-relaxed">
          We use <strong>cookies</strong> for site operation, <strong>Google Analytics</strong>, and{' '}
          <strong>Google AdSense</strong> advertising. See our{' '}
          <Link to="/privacy" className="text-teal-700 font-semibold hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={accept}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 border border-teal-600"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={decline}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { isIosSafari, isMobilePhone, isStandaloneDisplay } from '../utils/pwa';

const STORAGE_KEY = 'dividendflow_pwa_install_dismissed';
const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

function readDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

function WizardSteps({ platform }) {
  if (platform === 'ios') {
    return (
      <ol className="mt-4 space-y-3 text-sm text-slate-700">
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">1</span>
          <span>Tap the <strong>Share</strong> button in Safari (square with an arrow pointing up).</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">2</span>
          <span>Scroll down and choose <strong>Add to Home Screen</strong>.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">3</span>
          <span>Tap <strong>Add</strong> — DividendFlow PK opens like a native app.</span>
        </li>
      </ol>
    );
  }

  return (
    <ol className="mt-4 space-y-3 text-sm text-slate-700">
      <li className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">1</span>
        <span>Open your browser menu (usually the <strong>⋮</strong> or <strong>⋯</strong> icon).</span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">2</span>
        <span>Tap <strong>Install app</strong>, <strong>Add to Home screen</strong>, or <strong>Install DividendFlow</strong>.</span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice-100 text-ink text-xs font-bold">3</span>
        <span>Confirm — the app icon lands on your home screen for one-tap access.</span>
      </li>
    </ol>
  );
}

function InstallWizard({ open, onClose, platform, onNativeInstall, nativeReady }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Install DividendFlow as an app"
    >
      <div className="w-full max-w-md rounded-3xl border border-ice-200/80 bg-white shadow-2xl shadow-ink/20 overflow-hidden">
        <div className="bg-gradient-to-br from-ink via-ink-soft to-ice-700 px-5 py-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={LOGO} alt="" className="h-12 w-12 rounded-2xl border border-white/30 shadow-lg" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-ice-200/90">Install wizard</p>
                <h3 className="text-lg font-extrabold leading-tight">See the wizardry ✨</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/90 hover:bg-white/15"
              aria-label="Close install wizard"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-5 py-5">
          {nativeReady ? (
            <p className="text-sm text-slate-600">
              Your browser is ready — tap below and confirm the install prompt.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Follow these quick steps to add DividendFlow PK to your home screen.
            </p>
          )}
          {!nativeReady && <WizardSteps platform={platform} />}
          {nativeReady && (
            <button
              type="button"
              onClick={onNativeInstall}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-ink to-ink-soft px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-ink/20"
            >
              Install DividendFlow PK now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PwaInstallBanner() {
  const { installReady, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [platform, setPlatform] = useState('android');

  useEffect(() => {
    if (!isMobilePhone() || isStandaloneDisplay() || readDismissed()) return;
    setPlatform(isIosSafari() ? 'ios' : 'android');
    setVisible(true);
  }, []);

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
    setWizardOpen(false);
  };

  const handleInstallClick = async () => {
    if (installReady) {
      const { outcome } = await promptInstall();
      if (outcome === 'accepted') {
        dismiss();
      }
      return;
    }
    setWizardOpen(true);
  };

  const handleNativeFromWizard = async () => {
    const { outcome } = await promptInstall();
    if (outcome === 'accepted') {
      dismiss();
      return;
    }
    setWizardOpen(false);
  };

  if (!visible && !wizardOpen) return null;

  return (
    <>
      {visible && (
      <div
        className="fixed inset-x-0 top-0 z-[70] px-3 pt-3 sm:px-4 pointer-events-none"
        role="dialog"
        aria-label="Install DividendFlow as an app"
      >
        <div className="pointer-events-auto mx-auto max-w-lg overflow-hidden rounded-3xl border border-ice-300/60 bg-gradient-to-br from-ink via-ink-soft to-ice-700 shadow-2xl shadow-ink/25">
          <div className="relative px-5 pb-5 pt-4 text-white">
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-3 top-3 rounded-full p-2 text-white/90 hover:bg-white/15 transition-colors"
              aria-label="Dismiss install banner"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div className="flex items-center gap-3 pr-10">
              <img
                src={LOGO}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl border-2 border-white/30 shadow-lg"
                aria-hidden="true"
              />
              <p className="text-base sm:text-lg font-bold leading-snug">
                Want to download it as a web App on your phone for easier viewing :D
              </p>
            </div>

            <button
              type="button"
              onClick={handleInstallClick}
              className="mt-4 w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-extrabold text-ink shadow-lg shadow-ink/20 hover:bg-ice-50 active:scale-[0.99] transition-transform"
            >
              Click here below and see the Wizardry
            </button>

            <p className="mt-2 text-center text-[11px] font-medium text-ice-100/90">
              Free · No app store · Opens full-screen from your home screen
            </p>
          </div>
        </div>
      </div>
      )}

      <InstallWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        platform={platform}
        nativeReady={installReady}
        onNativeInstall={handleNativeFromWizard}
      />
    </>
  );
}

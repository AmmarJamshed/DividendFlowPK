const APP_VERSION = '3';
const VERSION_KEY = 'dividendflow_app_version';

async function clearLegacyCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function resetServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion && storedVersion !== APP_VERSION) {
      Promise.all([resetServiceWorkers(), clearLegacyCaches()])
        .then(() => {
          localStorage.setItem(VERSION_KEY, APP_VERSION);
          window.location.reload();
        })
        .catch(() => {
          localStorage.setItem(VERSION_KEY, APP_VERSION);
        });
      return;
    }

    localStorage.setItem(VERSION_KEY, APP_VERSION);

    const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js?v=${APP_VERSION}`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        registration.update().catch(() => {});

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {
        /* PWA still works where SW registration fails */
      });
  });
}

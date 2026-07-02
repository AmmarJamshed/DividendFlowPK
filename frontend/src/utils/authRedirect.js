const PRODUCTION_ORIGIN = 'https://dividendflow.pk';

/** Origin used for Supabase email confirmation / auth redirects. */
export function resolveSiteOrigin() {
  const configured = String(process.env.REACT_APP_SITE_URL || '').replace(/\/$/, '');
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) {
    return configured;
  }

  // Local dev only — production builds always confirm on dividendflow.pk.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin;
    }
  }

  return PRODUCTION_ORIGIN;
}

/** Supabase email-confirm and OAuth return URL. */
export function authCallbackUrl(nextPath = '/dividend-calendar') {
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
  return `${resolveSiteOrigin()}${base}/auth/callback${next}`;
}

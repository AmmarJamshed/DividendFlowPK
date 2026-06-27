const PRODUCTION_ORIGIN = 'https://dividendflow.pk';

/** Origin used for Supabase email confirmation / auth redirects. */
export function resolveSiteOrigin() {
  const configured = String(process.env.REACT_APP_SITE_URL || '').replace(/\/$/, '');
  if (configured) return configured;

  if (typeof window === 'undefined') return PRODUCTION_ORIGIN;

  const { hostname, origin, protocol } = window.location;
  if (hostname === 'dividendflow.pk' || hostname.endsWith('.dividendflow.pk')) {
    return PRODUCTION_ORIGIN;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return origin;
  }

  // Production builds on Render previews should still confirm via the live domain.
  if (process.env.NODE_ENV === 'production' && protocol === 'https:') {
    return PRODUCTION_ORIGIN;
  }

  return origin;
}

/** Supabase email-confirm and OAuth return URL. */
export function authCallbackUrl(nextPath = '/dividend-calendar') {
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
  return `${resolveSiteOrigin()}${base}/auth/callback${next}`;
}

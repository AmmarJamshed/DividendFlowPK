/** Supabase email-confirm and OAuth return URL for the current site origin. */
export function authCallbackUrl(nextPath = '/dividend-calendar') {
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
  return `${window.location.origin}${base}/auth/callback${next}`;
}

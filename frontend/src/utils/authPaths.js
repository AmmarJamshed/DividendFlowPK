/** Routes accessible without a completed account */
export const PUBLIC_PATHS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/complete-profile',
  '/auth/callback',
  '/privacy',
  '/terms',
  '/about',
  '/contact',
]);

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname);
}

export function authRedirectPath(pathname, search = '') {
  const next = `${pathname}${search || ''}`;
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

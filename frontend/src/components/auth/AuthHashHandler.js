import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearAuthHash,
  formatAuthError,
  hasAuthHashSession,
  parseAuthHashParams,
} from '../../utils/authUrlParams';

/** Route Supabase auth hash fragments (errors or tokens) to the callback or sign-in page. */
export default function AuthHashHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/auth/callback') return;

    const authError = parseAuthHashParams();
    if (authError) {
      clearAuthHash();
      const message = formatAuthError(authError);
      navigate(`/?authError=${encodeURIComponent(message)}`, { replace: true });
      return;
    }

    if (hasAuthHashSession()) {
      navigate(`/auth/callback${location.search}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}

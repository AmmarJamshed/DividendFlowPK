import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authRedirectPath } from '../utils/authPaths';

function AuthLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" aria-hidden />
        <p className="mt-3 text-sm text-slate-600">Checking your account…</p>
      </div>
    </div>
  );
}

export function RequireAuthRoute({ children }) {
  const { loading, signedIn, authConfigured } = useAuth();
  const location = useLocation();

  if (!authConfigured) return children;
  if (loading) return <AuthLoading />;
  if (!signedIn) {
    return (
      <Navigate
        to={authRedirectPath(location.pathname, location.search)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return children;
}

export default function ProtectedRoute({ children }) {
  const { loading, signedIn, profileComplete, authConfigured } = useAuth();
  const location = useLocation();

  if (!authConfigured) return children;
  if (loading) return <AuthLoading />;

  if (!signedIn) {
    return (
      <Navigate
        to={authRedirectPath(location.pathname, location.search)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (!profileComplete) {
    const next = `${location.pathname}${location.search || ''}`;
    return (
      <Navigate
        to={`/complete-profile?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  return children;
}

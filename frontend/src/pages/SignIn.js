import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

export default function SignIn() {
  usePageTitle('Sign in — DividendFlow PK');
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/dividend-calendar';
  const { signedIn, profileComplete, signInWithEmail, authConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError('');
  }, [email, password]);

  if (signedIn && profileComplete) {
    return <Navigate to={nextPath} replace />;
  }
  if (signedIn && !profileComplete) {
    return <Navigate to={`/complete-profile?next=${encodeURIComponent(nextPath)}`} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your email and password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Account"
      title="Sign in to DividendFlow PK"
      description="Overview stays free for everyone. Sign in to open the dividend calendar, market data, forecasts, and other PSX tools."
    >
      {!authConfigured && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sign-in could not connect to Supabase. On Render, set <strong>SUPABASE_URL</strong> and{' '}
          <strong>SUPABASE_ANON_KEY</strong> on <strong>dividendflow-backend</strong> (you may already have these),
          or set <strong>REACT_APP_SUPABASE_*</strong> on <strong>dividendflow-frontend</strong> and redeploy.
        </p>
      )}

      <GoogleSignInButton nextPath={nextPath} disabled={!authConfigured || busy} />

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">or email</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5" htmlFor="sign-in-email">
            Email
          </label>
          <input
            id="sign-in-email"
            type="email"
            autoComplete="email"
            required
            disabled={!authConfigured || busy}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5" htmlFor="sign-in-password">
            Password
          </label>
          <input
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!authConfigured || busy}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!authConfigured || busy}
          className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:from-teal-700 hover:to-cyan-700 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        New here?{' '}
        <Link
          to={`/sign-up?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-teal-700 hover:underline"
        >
          Create a free account
        </Link>
      </p>
    </AuthCard>
  );
}

import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard';
import ProfileFieldsForm from '../components/auth/ProfileFieldsForm';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const emptyProfile = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  phoneNumber: '',
  gender: '',
};

export default function SignUp() {
  usePageTitle('Sign up — DividendFlow PK');
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/dividend-calendar';
  const { signedIn, profileComplete, signUpWithEmail, authConfigured } = useAuth();
  const [values, setValues] = useState(emptyProfile);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

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
    setInfo('');
    try {
      const result = await signUpWithEmail({
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: values.phoneNumber,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        nextPath,
      });
      if (result.user && !result.session) {
        setInfo('Account created. Check your email and open the confirmation link at dividendflow.pk (not localhost).');
      } else if (result.session) {
        setInfo('Account created. You can now use DividendFlow PK tools.');
      }
    } catch (err) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Join"
      title="Create your DividendFlow PK account"
      description="Register with email and password. We collect your name, date of birth, phone number, and gender to unlock PSX tools."
    >
      {!authConfigured && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sign-up could not connect to Supabase. Ensure <strong>SUPABASE_URL</strong> and{' '}
          <strong>SUPABASE_ANON_KEY</strong> are set on <strong>dividendflow-backend</strong> on Render.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <ProfileFieldsForm
          values={values}
          onChange={setValues}
          showEmail
          showPassword
          disabled={!authConfigured || busy}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        <button
          type="submit"
          disabled={!authConfigured || busy}
          className="w-full rounded-xl bg-gradient-to-r from-ink to-ink-soft px-4 py-3 text-sm font-bold text-white shadow-md hover:from-ink-soft hover:to-ink-muted disabled:opacity-60"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          to={`/sign-in?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-ice-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

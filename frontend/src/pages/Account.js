import { Link } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard';
import { RequireAuthRoute } from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { GENDER_OPTIONS } from '../utils/profileFields';

function genderLabel(value) {
  return GENDER_OPTIONS.find((g) => g.value === value)?.label || '—';
}

function AccountContent() {
  usePageTitle('My account — DividendFlow PK');
  const { user, profile, profileComplete, signOut, authConfigured } = useAuth();

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Your account';

  return (
    <AuthCard
      eyebrow="Account"
      title={fullName}
      description="Manage your DividendFlow PK profile and sign-in details."
    >
      {!authConfigured && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Account services are still being configured on this deployment. Sign-in will work once Supabase keys are active.
        </p>
      )}

      {!profileComplete && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Your profile is incomplete.{' '}
          <Link to="/complete-profile?next=%2Faccount" className="font-semibold underline">
            Complete it now
          </Link>{' '}
          to unlock all PSX tools.
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
          <dd className="mt-1 font-medium text-slate-900">{user?.email || profile?.email || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
          <dd className="mt-1 font-medium text-slate-900">{profile?.phone_number || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date of birth</dt>
          <dd className="mt-1 font-medium text-slate-900">{profile?.date_of_birth || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</dt>
          <dd className="mt-1 font-medium text-slate-900">{genderLabel(profile?.gender)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sign-in method</dt>
          <dd className="mt-1 font-medium text-slate-900 capitalize">{profile?.auth_provider || 'email'}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/complete-profile?next=%2Faccount"
          className="inline-flex items-center justify-center rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100"
        >
          Edit profile
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-700"
        >
          Sign out
        </button>
      </div>
    </AuthCard>
  );
}

export default function Account() {
  return (
    <RequireAuthRoute>
      <AccountContent />
    </RequireAuthRoute>
  );
}

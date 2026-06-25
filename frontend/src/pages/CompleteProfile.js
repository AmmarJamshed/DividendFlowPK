import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard';
import ProfileFieldsForm from '../components/auth/ProfileFieldsForm';
import { RequireAuthRoute } from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { namesFromUserMetadata } from '../utils/profileFields';

function CompleteProfileForm() {
  usePageTitle('Complete profile — DividendFlow PK');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/dividend-calendar';
  const { user, profile, profileComplete, saveProfile } = useAuth();
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phoneNumber: '',
    gender: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromMeta = namesFromUserMetadata(user);
    setValues({
      firstName: profile?.first_name || fromMeta.firstName || '',
      lastName: profile?.last_name || fromMeta.lastName || '',
      dateOfBirth: profile?.date_of_birth || fromMeta.dateOfBirth || '',
      phoneNumber: profile?.phone_number || fromMeta.phone || '',
      gender: profile?.gender || fromMeta.gender || '',
    });
  }, [user, profile]);

  if (profileComplete) {
    return <Navigate to={nextPath} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveProfile(values);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="One more step"
      title="Complete your profile"
      description="Add your date of birth, phone number, and gender to unlock PSX tools."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <ProfileFieldsForm values={values} onChange={setValues} disabled={busy} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-ink to-ink-soft px-4 py-3 text-sm font-bold text-white shadow-md hover:from-ink-soft hover:to-ink-muted disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </AuthCard>
  );
}

export default function CompleteProfile() {
  return (
    <RequireAuthRoute>
      <CompleteProfileForm />
    </RequireAuthRoute>
  );
}

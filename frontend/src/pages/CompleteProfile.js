import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard';
import ProfileFieldsForm from '../components/auth/ProfileFieldsForm';
import { RequireAuthRoute } from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { namesFromGoogleMetadata } from '../utils/profileFields';

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
    const google = namesFromGoogleMetadata(user);
    setValues({
      firstName: profile?.first_name || google.firstName || '',
      lastName: profile?.last_name || google.lastName || '',
      dateOfBirth: profile?.date_of_birth || google.dateOfBirth || '',
      phoneNumber: profile?.phone_number || google.phone || '',
      gender: profile?.gender || google.gender || '',
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
      description="Google may share your name, but we still need your date of birth, phone number, and gender before opening PSX tools."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <ProfileFieldsForm values={values} onChange={setValues} disabled={busy} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:from-teal-700 hover:to-cyan-700 disabled:opacity-60"
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

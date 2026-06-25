import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { initSupabaseAuth } from '../lib/supabase';
import { isProfileComplete } from '../utils/profileFields';

export default function AuthCallback() {
  usePageTitle('Signing you in — DividendFlow PK');
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/dividend-calendar';
  const { refreshProfile } = useAuth();
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    let active = true;

    initSupabaseAuth().then(async (client) => {
      if (!active) return;
      if (!client) {
        setDestination(`/sign-in?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session?.user) {
        setDestination(`/sign-in?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      try {
        const profile = await refreshProfile(session.user);
        if (!active) return;
        if (isProfileComplete(profile)) {
          setDestination(nextPath);
        } else {
          setDestination(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
        }
      } catch {
        if (active) setDestination(`/sign-in?next=${encodeURIComponent(nextPath)}`);
      }
    });

    return () => {
      active = false;
    };
  }, [nextPath, refreshProfile]);

  if (destination) {
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" aria-hidden />
        <p className="mt-3 text-sm text-slate-600">Finishing sign-in…</p>
      </div>
    </div>
  );
}

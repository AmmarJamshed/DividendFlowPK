import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseAuthConfigured, supabase } from '../lib/supabase';
import { isProfileComplete, namesFromGoogleMetadata } from '../utils/profileFields';

const AuthContext = createContext(null);

function authCallbackUrl() {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${window.location.origin}${base}/auth/callback`;
}

async function fetchProfileRow(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureProfileFromUser(user) {
  if (!supabase || !user) return null;

  let profile = await fetchProfileRow(user.id);
  if (profile) return profile;

  const google = namesFromGoogleMetadata(user);
  const meta = user.user_metadata || {};
  const payload = {
    id: user.id,
    email: user.email,
    first_name: google.firstName || '',
    last_name: google.lastName || '',
    phone_number: google.phone || null,
    date_of_birth: google.dateOfBirth || null,
    gender: ['male', 'female', 'other', 'prefer_not_to_say'].includes(google.gender)
      ? google.gender
      : null,
    auth_provider: user.app_metadata?.provider || 'email',
  };

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    if (meta.first_name || google.firstName) {
      throw error;
    }
    return null;
  }
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseAuthConfigured);

  const refreshProfile = useCallback(async (user = session?.user) => {
    if (!user || !supabase) {
      setProfile(null);
      return null;
    }
    const row = await ensureProfileFromUser(user);
    setProfile(row);
    return row;
  }, [session?.user]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      if (!mounted) return;
      setSession(initial);
      if (initial?.user) {
        try {
          await ensureProfileFromUser(initial.user).then((row) => {
            if (mounted) setProfile(row);
          });
        } catch {
          if (mounted) setProfile(null);
        }
      }
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        try {
          const row = await ensureProfileFromUser(nextSession.user);
          setProfile(row);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (nextPath = '/') => {
    if (!supabase) throw new Error('Sign-in is not configured yet.');
    const redirectTo = `${authCallbackUrl()}?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Sign-in is not configured yet.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await refreshProfile(data.user);
    return data;
  }, [refreshProfile]);

  const signUpWithEmail = useCallback(async ({ email, password, firstName, lastName, phoneNumber, dateOfBirth, gender }) => {
    if (!supabase) throw new Error('Sign-up is not configured yet.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneNumber.trim(),
          date_of_birth: dateOfBirth,
          gender,
        },
      },
    });
    if (error) throw error;
    if (data.user) await refreshProfile(data.user);
    return data;
  }, [refreshProfile]);

  const saveProfile = useCallback(async (fields) => {
    if (!supabase || !session?.user) throw new Error('You must be signed in.');
    const payload = {
      id: session.user.id,
      email: session.user.email,
      first_name: fields.firstName.trim(),
      last_name: fields.lastName.trim(),
      phone_number: fields.phoneNumber.trim(),
      date_of_birth: fields.dateOfBirth,
      gender: fields.gender,
    };
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    setProfile(data);
    return data;
  }, [session?.user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const profileComplete = isProfileComplete(profile);
    const signedIn = Boolean(session?.user);
    const canAccessTools = !isSupabaseAuthConfigured || (signedIn && profileComplete);

    return {
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authConfigured: isSupabaseAuthConfigured,
      signedIn,
      profileComplete,
      canAccessTools,
      refreshProfile,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      saveProfile,
      signOut,
    };
  }, [
    session,
    profile,
    loading,
    refreshProfile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    saveProfile,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

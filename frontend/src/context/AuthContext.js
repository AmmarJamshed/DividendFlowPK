import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadUserProfile, primeProfileCache, resetProfileCache } from '../lib/authProfile';
import { getSupabase, initSupabaseAuth } from '../lib/supabase';
import { authCallbackUrl } from '../utils/authRedirect';
import { isUserProfileComplete } from '../utils/profileFields';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const profileUserIdRef = useRef(null);
  const profileRef = useRef(null);
  profileRef.current = profile;

  const hydrateProfile = useCallback(async (user) => {
    const client = getSupabase();
    if (!user || !client) {
      setProfile(null);
      profileUserIdRef.current = null;
      return null;
    }

    if (profileUserIdRef.current === user.id && profileRef.current) {
      return profileRef.current;
    }

    try {
      const row = await loadUserProfile(client, user);
      profileUserIdRef.current = user.id;
      profileRef.current = row;
      setProfile(row);
      return row;
    } catch {
      profileUserIdRef.current = user.id;
      profileRef.current = null;
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    initSupabaseAuth().then((client) => {
      if (!mounted) return;

      if (!client) {
        setAuthConfigured(false);
        setLoading(false);
        return;
      }

      setAuthConfigured(true);

      const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);
        setLoading(false);

        if (nextSession?.user) {
          hydrateProfile(nextSession.user);
        } else {
          profileUserIdRef.current = null;
          setProfile(null);
          resetProfileCache();
        }
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [hydrateProfile]);

  const refreshProfile = useCallback(async (user = session?.user) => {
    const client = getSupabase();
    if (!user || !client) {
      setProfile(null);
      profileUserIdRef.current = null;
      return null;
    }
    profileUserIdRef.current = null;
    return hydrateProfile(user);
  }, [hydrateProfile, session?.user]);

  const signInWithEmail = useCallback(async (email, password) => {
    const client = getSupabase();
    if (!client) throw new Error('Sign-in is not configured yet.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await refreshProfile(data.user);
    return data;
  }, [refreshProfile]);

  const signUpWithEmail = useCallback(async ({ email, password, firstName, lastName, phoneNumber, dateOfBirth, gender }) => {
    const client = getSupabase();
    if (!client) throw new Error('Sign-up is not configured yet.');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl('/dividend-calendar'),
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
    if (data.session?.user) {
      await refreshProfile(data.session.user);
    }
    return data;
  }, [refreshProfile]);

  const resendConfirmationEmail = useCallback(async (email, nextPath = '/dividend-calendar') => {
    const client = getSupabase();
    if (!client) throw new Error('Sign-in is not configured yet.');
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: authCallbackUrl(nextPath),
      },
    });
    if (error) throw error;
  }, []);

  const saveProfile = useCallback(async (fields) => {
    const client = getSupabase();
    if (!client || !session?.user) throw new Error('You must be signed in.');
    const payload = {
      id: session.user.id,
      email: session.user.email,
      first_name: fields.firstName.trim(),
      last_name: fields.lastName.trim(),
      phone_number: fields.phoneNumber.trim(),
      date_of_birth: fields.dateOfBirth,
      gender: fields.gender,
    };
    const { data, error } = await client
      .from('user_profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    primeProfileCache(session.user.id, data);
    profileUserIdRef.current = session.user.id;
    setProfile(data);
    return data;
  }, [session?.user]);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    await client.auth.signOut();
    profileUserIdRef.current = null;
    setProfile(null);
    resetProfileCache();
  }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;
    const profileComplete = isUserProfileComplete(profile, user);
    const signedIn = Boolean(user);
    const canAccessTools = !authConfigured || (signedIn && profileComplete);

    return {
      session,
      user,
      profile,
      loading,
      authConfigured,
      signedIn,
      profileComplete,
      canAccessTools,
      refreshProfile,
      signInWithEmail,
      signUpWithEmail,
      resendConfirmationEmail,
      saveProfile,
      signOut,
    };
  }, [
    session,
    profile,
    loading,
    authConfigured,
    refreshProfile,
    signInWithEmail,
    signUpWithEmail,
    resendConfirmationEmail,
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

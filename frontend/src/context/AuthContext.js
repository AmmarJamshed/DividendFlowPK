import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase, initSupabaseAuth } from '../lib/supabase';
import { isProfileComplete, namesFromUserMetadata } from '../utils/profileFields';

const AuthContext = createContext(null);

async function fetchProfileRow(client, userId) {
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureProfileFromUser(client, user, { allowUpsert = true } = {}) {
  if (!user) return null;

  let profile = await fetchProfileRow(client, user.id);
  if (profile) return profile;
  if (!allowUpsert) return null;

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session?.user || sessionData.session.user.id !== user.id) {
    return null;
  }

  const fromMeta = namesFromUserMetadata(user);
  const payload = {
    id: user.id,
    email: user.email,
    first_name: fromMeta.firstName || '',
    last_name: fromMeta.lastName || '',
    phone_number: fromMeta.phone || null,
    date_of_birth: fromMeta.dateOfBirth || null,
    gender: ['male', 'female', 'other', 'prefer_not_to_say'].includes(fromMeta.gender)
      ? fromMeta.gender
      : null,
    auth_provider: user.app_metadata?.provider || 'email',
  };

  const { data, error } = await client
    .from('user_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    profile = await fetchProfileRow(client, user.id);
    if (profile) return profile;
    throw error;
  }
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);

  const refreshProfile = useCallback(async (user = session?.user) => {
    const client = getSupabase();
    if (!user || !client) {
      setProfile(null);
      return null;
    }
    const row = await ensureProfileFromUser(client, user);
    setProfile(row);
    return row;
  }, [session?.user]);

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

      client.auth.getSession().then(async ({ data: { session: initial } }) => {
        if (!mounted) return;
        setSession(initial);
        if (initial?.user) {
          try {
            const row = await ensureProfileFromUser(client, initial.user);
            if (mounted) setProfile(row);
          } catch {
            if (mounted) setProfile(null);
          }
        }
        if (mounted) setLoading(false);
      });

      const { data: listener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user) {
          try {
            const row = await ensureProfileFromUser(client, nextSession.user);
            setProfile(row);
          } catch {
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

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
    setProfile(data);
    return data;
  }, [session?.user]);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    await client.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const profileComplete = isProfileComplete(profile);
    const signedIn = Boolean(session?.user);
    const canAccessTools = !authConfigured || (signedIn && profileComplete);

    return {
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authConfigured,
      signedIn,
      profileComplete,
      canAccessTools,
      refreshProfile,
      signInWithEmail,
      signUpWithEmail,
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

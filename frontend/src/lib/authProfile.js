import { namesFromUserMetadata } from '../utils/profileFields';

const PROFILE_CACHE_KEY = 'dividendflow_profile_cache';
const PROFILE_FETCH_MS = 8000;

function readProfileCache(userId) {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id !== userId) return null;
    return parsed.profile ?? null;
  } catch {
    return null;
  }
}

function writeProfileCache(userId, profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: userId, profile }));
  } catch {
    /* ignore quota errors */
  }
}

function clearProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Profile request timed out')), ms);
    }),
  ]);
}

let inflightUserId = null;
let inflightPromise = null;

export async function fetchProfileRow(client, userId) {
  const { data, error } = await withTimeout(
    client.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
    PROFILE_FETCH_MS
  );
  if (error) throw error;
  return data;
}

export async function loadUserProfile(client, user, { allowUpsert = true } = {}) {
  if (!user) return null;

  const cached = readProfileCache(user.id);
  if (cached) return cached;

  if (inflightUserId === user.id && inflightPromise) {
    return inflightPromise;
  }

  inflightUserId = user.id;
  inflightPromise = (async () => {
    let profile = await fetchProfileRow(client, user.id);
    if (profile) {
      writeProfileCache(user.id, profile);
      return profile;
    }
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

    const { data, error } = await withTimeout(
      client.from('user_profiles').upsert(payload, { onConflict: 'id' }).select('*').single(),
      PROFILE_FETCH_MS
    );

    if (error) {
      profile = await fetchProfileRow(client, user.id);
      if (profile) {
        writeProfileCache(user.id, profile);
        return profile;
      }
      throw error;
    }

    writeProfileCache(user.id, data);
    return data;
  })().finally(() => {
    if (inflightUserId === user.id) {
      inflightUserId = null;
      inflightPromise = null;
    }
  });

  return inflightPromise;
}

export function primeProfileCache(userId, profile) {
  if (userId && profile) writeProfileCache(userId, profile);
}

export function resetProfileCache() {
  clearProfileCache();
  inflightUserId = null;
  inflightPromise = null;
}

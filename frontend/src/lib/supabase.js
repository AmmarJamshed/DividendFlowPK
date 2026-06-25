import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;
let initPromise = null;

function createSupabaseClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function loadRuntimeConfig() {
  const apiBase = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;
  const res = await fetch(`${String(apiBase).replace(/\/$/, '')}/public-config`);
  if (!res.ok) throw new Error('Could not load auth config');
  return res.json();
}

/** Resolve Supabase client from build-time env or backend public config. */
export async function initSupabaseAuth() {
  if (supabaseClient) return supabaseClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let url = process.env.REACT_APP_SUPABASE_URL || '';
    let anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

    if (!url || !anonKey) {
      try {
        const runtime = await loadRuntimeConfig();
        url = runtime.supabaseUrl || '';
        anonKey = runtime.supabaseAnonKey || '';
      } catch {
        return null;
      }
    }

    if (!url || !anonKey) return null;

    supabaseClient = createSupabaseClient(url, anonKey);
    return supabaseClient;
  })();

  return initPromise;
}

export function getSupabase() {
  return supabaseClient;
}

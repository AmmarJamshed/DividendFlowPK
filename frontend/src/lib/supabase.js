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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${String(apiBase).replace(/\/$/, '')}/public-config`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Could not load auth config');
    return res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

/** Resolve Supabase client from build-time env or backend public config. */
export function initSupabaseAuth() {
  if (supabaseClient) return Promise.resolve(supabaseClient);
  if (initPromise) return initPromise;

  const buildUrl = process.env.REACT_APP_SUPABASE_URL || '';
  const buildAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
  if (buildUrl && buildAnonKey) {
    supabaseClient = createSupabaseClient(buildUrl, buildAnonKey);
    return Promise.resolve(supabaseClient);
  }

  initPromise = (async () => {
    try {
      const runtime = await loadRuntimeConfig();
      const url = runtime.supabaseUrl || '';
      const anonKey = runtime.supabaseAnonKey || '';
      if (!url || !anonKey) return null;
      supabaseClient = createSupabaseClient(url, anonKey);
      return supabaseClient;
    } catch {
      return null;
    }
  })();

  return initPromise;
}

export function getSupabase() {
  return supabaseClient;
}

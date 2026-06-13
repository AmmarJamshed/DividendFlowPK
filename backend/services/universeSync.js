const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');
const { fetchUniverseSymbols } = require('./universeSymbols');

const FULL_UNIVERSE = new Set(['NYSE', 'NASDAQ', 'HKEX', 'LSE']);
const syncState = new Map();

async function ensureExchangeUniverse(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  if (!FULL_UNIVERSE.has(code)) return { synced: false, reason: 'not_full_universe' };
  if (!isSupabaseConfigured()) return { synced: false, reason: 'no_supabase' };

  const cached = syncState.get(code);
  if (cached?.promise) return cached.promise;

  const promise = syncUniverseInternal(code).finally(() => {
    const entry = syncState.get(code);
    if (entry) entry.running = false;
  });

  syncState.set(code, { running: true, promise, at: Date.now() });
  return promise;
}

async function syncUniverseInternal(code) {
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return { synced: false, reason: 'no_exchange_id' };

  let symbols = [];
  try {
    symbols = await fetchUniverseSymbols(code);
  } catch (err) {
    console.warn('[universeSync] fetch failed:', code, err.message);
    return { synced: false, reason: err.message };
  }

  const supabase = getSupabase();
  const { data: existing, error: exErr } = await supabase
    .from('securities')
    .select('symbol')
    .eq('exchange_id', exchangeId)
    .eq('active', true);
  if (exErr) throw exErr;

  const have = new Set((existing || []).map((r) => String(r.symbol).toUpperCase()));
  const missing = symbols.filter((s) => !have.has(String(s).toUpperCase()));
  if (!missing.length) {
    return { synced: true, added: 0, total: have.size, universe: symbols.length };
  }

  let added = 0;
  const batchSize = 400;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const payload = batch.map((symbol) => ({
      exchange_id: exchangeId,
      symbol: String(symbol).toUpperCase(),
      name: String(symbol).toUpperCase(),
      active: true,
    }));
    const { error } = await supabase.from('securities').upsert(payload, {
      onConflict: 'exchange_id,symbol',
    });
    if (error) throw error;
    added += batch.length;
  }

  return { synced: true, added, total: have.size + added, universe: symbols.length };
}

module.exports = {
  ensureExchangeUniverse,
  FULL_UNIVERSE,
};

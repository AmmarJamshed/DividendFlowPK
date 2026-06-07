const fs = require('fs');
const path = require('path');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');

const CONFIG_PATH = path.join(__dirname, '../config/exchanges.json');
const DEFAULT_EXCHANGE = 'PSX';

let configCache = null;
const exchangeIdCache = new Map();

function loadConfig() {
  if (!configCache) {
    configCache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return configCache;
}

function listExchanges() {
  return loadConfig();
}

function getExchangeConfig(code) {
  const normalized = String(code || DEFAULT_EXCHANGE).toUpperCase();
  return loadConfig().find((e) => e.code === normalized) || loadConfig().find((e) => e.code === DEFAULT_EXCHANGE);
}

function normalizeExchangeCode(code) {
  const normalized = String(code || DEFAULT_EXCHANGE).toUpperCase();
  const found = loadConfig().find((e) => e.code === normalized);
  return found ? found.code : DEFAULT_EXCHANGE;
}

async function getExchangeId(code) {
  const normalized = normalizeExchangeCode(code);
  if (exchangeIdCache.has(normalized)) return exchangeIdCache.get(normalized);

  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('exchanges')
    .select('id, code, name, currency, timezone')
    .eq('code', normalized)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) exchangeIdCache.set(normalized, data.id);
  return data?.id || null;
}

function yfinanceTicker(symbol, exchangeCode) {
  const cfg = getExchangeConfig(exchangeCode);
  const sym = String(symbol).toUpperCase().trim();
  const suffix = cfg?.yfinanceSuffix || '';
  if (suffix && sym.endsWith(suffix.replace('.', ''))) return sym;
  return `${sym}${suffix}`;
}

module.exports = {
  DEFAULT_EXCHANGE,
  loadConfig,
  listExchanges,
  getExchangeConfig,
  normalizeExchangeCode,
  getExchangeId,
  yfinanceTicker,
};

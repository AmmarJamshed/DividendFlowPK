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

function assertExchangeSupported(code) {
  const normalized = String(code || '').toUpperCase();
  const found = loadConfig().find((e) => e.code === normalized);
  if (!found) {
    const err = new Error(`Exchange not supported: ${code}`);
    err.status = 404;
    throw err;
  }
  return found.code;
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

function normalizeListingSymbol(symbol, exchangeCode) {
  const code = normalizeExchangeCode(exchangeCode);
  let sym = String(symbol || '').toUpperCase().trim();
  if (code === 'HKEX' && /^\d+$/.test(sym)) {
    sym = sym.padStart(4, '0');
  }
  return sym;
}

function resolveCompanyName(symbol, exchangeCode, storedName) {
  const sym = normalizeListingSymbol(symbol, exchangeCode);
  const cfg = getExchangeConfig(exchangeCode);
  const mapped = cfg?.symbolDisplayNames?.[sym];
  if (mapped) return mapped;
  const name = String(storedName || '').trim();
  if (name && name.toUpperCase() !== sym && !/^\d+$/.test(name)) return name;
  return name || sym;
}

function yfinanceTicker(symbol, exchangeCode) {
  const cfg = getExchangeConfig(exchangeCode);
  const sym = normalizeListingSymbol(symbol, exchangeCode);
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
  assertExchangeSupported,
  normalizeListingSymbol,
  resolveCompanyName,
  getExchangeId,
  yfinanceTicker,
};

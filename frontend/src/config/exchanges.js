export const EXCHANGES = [
  { code: 'PSX', name: 'Pakistan (PSX)', currency: 'PKR', country: 'PK', shariahFilter: true },
  { code: 'NYSE', name: 'NYSE', currency: 'USD', country: 'US', shariahFilter: false },
  { code: 'NASDAQ', name: 'NASDAQ', currency: 'USD', country: 'US', shariahFilter: false },
  { code: 'TADAWUL', name: 'Tadawul', currency: 'SAR', country: 'SA', shariahFilter: false },
  { code: 'SSE', name: 'Shanghai (SSE)', currency: 'CNY', country: 'CN', shariahFilter: false },
  { code: 'HKEX', name: 'Hong Kong', currency: 'HKD', country: 'HK', shariahFilter: false },
  { code: 'TSE', name: 'Tokyo (TSE)', currency: 'JPY', country: 'JP', shariahFilter: false },
  { code: 'LSE', name: 'London (LSE)', currency: 'GBP', country: 'GB', shariahFilter: false },
];

export const DEFAULT_EXCHANGE = 'PSX';

export function getExchange(code) {
  const c = String(code || DEFAULT_EXCHANGE).toUpperCase();
  return EXCHANGES.find((e) => e.code === c) || EXCHANGES[0];
}

export function stockPath(exchange, symbol) {
  return `/stock/${String(exchange).toUpperCase()}/${String(symbol).toUpperCase()}`;
}

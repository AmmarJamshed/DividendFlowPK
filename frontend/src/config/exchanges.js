export const EXCHANGES = [
  { code: 'PSX', name: 'Pakistan (PSX)', currency: 'PKR', country: 'PK', shariahFilter: true },
];

export const DEFAULT_EXCHANGE = 'PSX';

export function getExchange(code) {
  const c = String(code || DEFAULT_EXCHANGE).toUpperCase();
  return EXCHANGES.find((e) => e.code === c) || EXCHANGES[0];
}

export function stockPath(exchange, symbol) {
  return `/stock/PSX/${String(symbol).toUpperCase()}`;
}

export function formatMoney(amount, currency = 'PKR', locale) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const loc =
    locale ||
    ({
      PKR: 'en-PK',
      USD: 'en-US',
      GBP: 'en-GB',
      SAR: 'ar-SA',
      CNY: 'zh-CN',
      HKD: 'en-HK',
      JPY: 'ja-JP',
    }[currency] ||
      'en-US');

  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString()}`;
  }
}

export function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

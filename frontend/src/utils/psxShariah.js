import shariahData from '../data/psx_shariah_compliant.json';

const SHARIAH_SYMBOLS = new Set(
  (shariahData.symbols || []).map((s) => String(s).toUpperCase().trim())
);

export const SHARIAH_LIST_META = {
  source: shariahData.source,
  sourceUrl: shariahData.sourceUrl,
  asOf: shariahData.asOf,
  note: shariahData.note,
  symbolCount: shariahData.symbolCount ?? SHARIAH_SYMBOLS.size,
};

export function isShariahCompliant(symbol) {
  const up = String(symbol || '').toUpperCase().trim();
  return up.length > 0 && SHARIAH_SYMBOLS.has(up);
}

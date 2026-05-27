/**
 * Parse dividend amounts from PSX dps.psx.com.pk announcement text.
 * Face value is usually Rs 10; some notices state "AT A PREMIUM RS. 170/- PER SHARE".
 */

function parsePaymentMonthNum(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const asInt = parseInt(s, 10);
  if (asInt >= 1 && asInt <= 12) return asInt;
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) {
    const m = parseInt(iso[2], 10);
    return m >= 1 && m <= 12 ? m : null;
  }
  const dmy = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const m = parseInt(dmy[2], 10);
    return m >= 1 && m <= 12 ? m : null;
  }
  return null;
}

/**
 * @returns {{ dps: number, parValue: number, method: string|null }}
 */
function parseDpsFromPsxAnnouncement(ann) {
  const s = String(ann || '').trim();
  if (!s) return { dps: 0, parValue: 10, method: null };

  let parValue = 10;
  const premium = s.match(/PREMIUM\s+RS\.?\s*([\d,]+)/i);
  if (premium) {
    const p = parseFloat(premium[1].replace(/,/g, ''));
    if (Number.isFinite(p) && p > 0) parValue = p;
  }

  const cashEq = s.match(/^=\s*([\d,.]+)\s+AT\s+A\s+PREMIUM/i);
  if (cashEq) {
    const v = parseFloat(cashEq[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0 && v < 5000) {
      return { dps: Math.round(v * 10000) / 10000, parValue, method: 'cash_premium' };
    }
  }

  const cashPlain = s.match(/^([\d,.]+)\s+AT\s+A\s+PREMIUM/i);
  if (cashPlain && !s.startsWith('=')) {
    const v = parseFloat(cashPlain[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0 && v < 5000) {
      return { dps: Math.round(v * 10000) / 10000, parValue, method: 'cash_premium' };
    }
  }

  const pctM = s.match(/^([\d,.]+)\s*%/);
  if (pctM) {
    const pct = parseFloat(pctM[1].replace(/,/g, ''));
    if (Number.isFinite(pct) && pct > 0) {
      const dps = Math.round((pct / 100) * parValue * 10000) / 10000;
      if (dps > 0 && dps < 5000) {
        return { dps, parValue, method: 'percent_of_par' };
      }
    }
  }

  return { dps: 0, parValue, method: null };
}

function pickDividendPerShare({ announcement, calendarDps }) {
  const parsed = parseDpsFromPsxAnnouncement(announcement);
  const cal = parseFloat(calendarDps) || 0;

  if (parsed.dps > 0) {
    const mismatch =
      cal > 0 && Math.abs(cal - parsed.dps) / Math.max(cal, parsed.dps) > 0.2;
    return {
      dps: parsed.dps,
      dpsSource: 'psx_announcement',
      dpsParValue: parsed.parValue,
      dpsParseMethod: parsed.method,
      calendarDpsMismatch: mismatch,
    };
  }

  if (cal > 0) {
    return {
      dps: cal,
      dpsSource: 'legacy_calendar',
      dpsParValue: null,
      dpsParseMethod: null,
      calendarDpsMismatch: false,
    };
  }

  return {
    dps: 0,
    dpsSource: 'unknown',
    dpsParValue: null,
    dpsParseMethod: null,
    calendarDpsMismatch: false,
  };
}

module.exports = {
  parsePaymentMonthNum,
  parseDpsFromPsxAnnouncement,
  pickDividendPerShare,
};

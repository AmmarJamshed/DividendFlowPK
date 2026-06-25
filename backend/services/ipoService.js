const fs = require('fs');
const path = require('path');
const exchangeService = require('./exchangeService');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'ipos');

const REGISTRATION_LINKS = {
  PSX: {
    psxEipo: 'https://eipo.psx.com.pk/EIPO/',
    psxEipoRegister: 'https://eipo.psx.com.pk/EIPO/User/Register',
    cdcEipo: 'https://www.cdceipo.com/',
    publicPride: 'https://www.psx.com.pk/psx/pride',
    psxListings: 'https://www.psx.com.pk/psx/listings/',
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  return String(value);
}

function isBetween(dateStr, start, end) {
  if (!dateStr || !start || !end) return false;
  return dateStr >= start && dateStr <= end;
}

function derivePhase(ipo, asOf) {
  const registrationOpen = isBetween(asOf, ipo.registrationStart, ipo.registrationEnd);
  const bookBuildingOpen = isBetween(asOf, ipo.bookBuildingStart, ipo.bookBuildingEnd);
  const subscriptionOpen = isBetween(asOf, ipo.subscriptionStart, ipo.subscriptionEnd);

  if (subscriptionOpen) return 'subscription_open';
  if (bookBuildingOpen) return 'book_building';
  if (registrationOpen) return 'registration_open';

  const milestones = [
    ipo.registrationStart,
    ipo.bookBuildingStart,
    ipo.subscriptionStart,
  ].filter(Boolean);

  const lastEnd = [ipo.subscriptionEnd, ipo.bookBuildingEnd, ipo.registrationEnd]
    .filter(Boolean)
    .sort()
    .pop();

  if (lastEnd && asOf > lastEnd) return 'closed';

  const nextStart = milestones.filter((d) => d > asOf).sort()[0];
  if (nextStart) return 'upcoming';

  return 'upcoming';
}

const PHASE_LABELS = {
  registration_open: 'Registration open',
  book_building: 'Book building',
  subscription_open: 'Public subscription open',
  upcoming: 'Upcoming',
  closed: 'Closed',
};

function normalizeIpo(raw, asOf) {
  const exchange = exchangeService.normalizeExchangeCode(raw.exchange || 'PSX');
  const phase = derivePhase(raw, asOf);
  return {
    id: raw.id,
    exchange,
    country: raw.country || 'PK',
    companyName: raw.companyName,
    symbol: raw.symbol || null,
    sector: raw.sector || '',
    offerType: raw.offerType || 'IPO',
    parentCompany: raw.parentCompany || null,
    issueSizeShares: raw.issueSizeShares ?? null,
    floorPricePkr: raw.floorPricePkr ?? null,
    priceCapPkr: raw.priceCapPkr ?? null,
    registrationStart: parseDate(raw.registrationStart),
    registrationEnd: parseDate(raw.registrationEnd),
    bookBuildingStart: parseDate(raw.bookBuildingStart),
    bookBuildingEnd: parseDate(raw.bookBuildingEnd),
    subscriptionStart: parseDate(raw.subscriptionStart),
    subscriptionEnd: parseDate(raw.subscriptionEnd),
    prospectusUrl: raw.prospectusUrl || null,
    companyUrl: raw.companyUrl || null,
    source: raw.source || null,
    notes: raw.notes || null,
    phase,
    phaseLabel: PHASE_LABELS[phase] || 'Upcoming',
    registrationLinks: REGISTRATION_LINKS[exchange] || null,
    updatedAt: raw.updatedAt || null,
  };
}

function loadExchangeIpos(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const fileMap = {
    PSX: 'psx_ipos.json',
  };
  const fileName = fileMap[code];
  if (!fileName) return [];

  const filePath = path.join(DATA_PATH, fileName);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn('[ipoService] failed to read', filePath, err.message);
    return [];
  }
}

function sortIpos(rows) {
  const rank = {
    subscription_open: 0,
    book_building: 1,
    registration_open: 2,
    upcoming: 3,
    closed: 4,
  };
  return [...rows].sort((a, b) => {
    const phaseDiff = (rank[a.phase] ?? 9) - (rank[b.phase] ?? 9);
    if (phaseDiff !== 0) return phaseDiff;
    const aDate = a.subscriptionStart || a.registrationStart || '';
    const bDate = b.subscriptionStart || b.registrationStart || '';
    return aDate.localeCompare(bDate);
  });
}

function getIposForExchange(exchangeCode, options = {}) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const asOf = options.asOf || todayIso();
  const includeClosed = Boolean(options.includeClosed);
  const rows = loadExchangeIpos(code).map((row) => normalizeIpo(row, asOf));
  const filtered = includeClosed ? rows : rows.filter((row) => row.phase !== 'closed');
  const sorted = sortIpos(filtered);

  return {
    exchange: code,
    asOf,
    registrationLinks: REGISTRATION_LINKS[code] || null,
    rows: sorted,
    summary: {
      total: sorted.length,
      openNow: sorted.filter((r) =>
        ['registration_open', 'book_building', 'subscription_open'].includes(r.phase)
      ).length,
      upcoming: sorted.filter((r) => r.phase === 'upcoming').length,
    },
  };
}

function listSupportedIpoExchanges() {
  const fileMap = { PSX: 'psx_ipos.json' };
  return Object.keys(REGISTRATION_LINKS).map((code) => {
    const cfg = exchangeService.getExchangeConfig(code);
    const fileName = fileMap[code];
    return {
      code,
      name: cfg.name,
      country: cfg.country,
      hasData: Boolean(fileName && fs.existsSync(path.join(DATA_PATH, fileName))),
    };
  });
}

module.exports = {
  getIposForExchange,
  listSupportedIpoExchanges,
  REGISTRATION_LINKS,
};

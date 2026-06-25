const fs = require('fs');
const path = require('path');
const exchangeService = require('./exchangeService');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'ipos');
const LINKS_PATH = path.join(__dirname, '..', 'config', 'ipoRegistrationLinks.json');

let registrationLinksCache = null;

function loadRegistrationLinks() {
  if (!registrationLinksCache) {
    registrationLinksCache = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'));
  }
  return registrationLinksCache;
}

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

function lastRelevantDate(ipo) {
  const dates = [
    ipo.subscriptionEnd,
    ipo.subscriptionStart,
    ipo.bookBuildingEnd,
    ipo.registrationEnd,
  ].filter(Boolean);
  return dates.sort().pop() || null;
}

function isStillRelevant(ipo, asOf) {
  const last = lastRelevantDate(ipo);
  return Boolean(last && last >= asOf);
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

function defaultCurrency(exchangeCode) {
  return exchangeService.getExchangeConfig(exchangeCode)?.currency || null;
}

function normalizeIpo(raw, asOf) {
  const exchange = exchangeService.normalizeExchangeCode(raw.exchange || 'PSX');
  const cfg = exchangeService.getExchangeConfig(exchange);
  const floor = raw.floorPrice ?? raw.floorPricePkr ?? null;
  const cap = raw.priceCap ?? raw.priceCapPkr ?? floor;
  const ipo = {
    id: raw.id,
    exchange,
    country: raw.country || cfg.country || null,
    companyName: raw.companyName,
    symbol: raw.symbol || null,
    sector: raw.sector || '',
    offerType: raw.offerType || 'IPO',
    parentCompany: raw.parentCompany || null,
    issueSizeShares: raw.issueSizeShares ?? null,
    floorPrice: floor,
    priceCap: cap,
    currency: raw.currency || defaultCurrency(exchange),
    registrationStart: parseDate(raw.registrationStart),
    registrationEnd: parseDate(raw.registrationEnd),
    bookBuildingStart: parseDate(raw.bookBuildingStart),
    bookBuildingEnd: parseDate(raw.bookBuildingEnd),
    subscriptionStart: parseDate(raw.subscriptionStart),
    subscriptionEnd: parseDate(raw.subscriptionEnd),
    prospectusUrl: raw.prospectusUrl || null,
    companyUrl: raw.companyUrl || null,
    registerUrl: raw.registerUrl || null,
    source: raw.source || null,
    notes: raw.notes || null,
    updatedAt: raw.updatedAt || null,
  };
  const phase = derivePhase(ipo, asOf);
  const links = loadRegistrationLinks()[exchange] || null;
  return {
    ...ipo,
    phase,
    phaseLabel: PHASE_LABELS[phase] || 'Upcoming',
    registrationLinks: links,
  };
}

function loadExchangeIpos(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const filePath = path.join(DATA_PATH, `${code.toLowerCase()}_ipos.json`);
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
  const code = exchangeService.assertExchangeSupported(exchangeCode);
  const asOf = options.asOf || todayIso();
  const includeClosed = Boolean(options.includeClosed);
  const rows = loadExchangeIpos(code)
    .map((row) => normalizeIpo(row, asOf))
    .filter((row) => includeClosed || isStillRelevant(row, asOf))
    .filter((row) => includeClosed || row.phase !== 'closed');
  const sorted = sortIpos(rows);
  const links = loadRegistrationLinks()[code] || null;

  return {
    exchange: code,
    asOf,
    registrationLinks: links,
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
  const links = loadRegistrationLinks();
  return exchangeService.listExchanges().map((cfg) => {
    const filePath = path.join(DATA_PATH, `${cfg.code.toLowerCase()}_ipos.json`);
    return {
      code: cfg.code,
      name: cfg.name,
      country: cfg.country,
      hasData: fs.existsSync(filePath),
      hasLinks: Boolean(links[cfg.code]),
    };
  });
}

module.exports = {
  getIposForExchange,
  listSupportedIpoExchanges,
};

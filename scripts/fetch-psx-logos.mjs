/**
 * Fetch real PSX company logos via TradingView logoid → s3-symbol-logo CDN.
 * Prefers SVG; rejects known generic placeholders and any hash shared by many symbols.
 *
 * Usage: node scripts/fetch-psx-logos.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LOGO_DIR = path.join(ROOT, 'frontend', 'public', 'logos');
const MANIFEST_PATH = path.join(ROOT, 'frontend', 'src', 'data', 'psxLogos.json');

const PLACEHOLDER_SHA1 = new Set([
  // TradingView generic green-circle PNG (5680 bytes) from prior bad scrape
  '60c8ab0a083c11ff008fed000ded46cb1e3ec416',
]);

const BAD_LOGOID_PREFIXES = ['indices/', 'country/', 'source/', 'crypto/'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function fetchAllLogoids() {
  const out = new Map();
  const pageSize = 150;
  let start = 0;
  let total = Infinity;

  while (start < total) {
    const res = await fetch('https://scanner.tradingview.com/pakistan/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DividendFlowPK-logo-fetch/2.0',
      },
      body: JSON.stringify({
        filter: [{ left: 'exchange', operation: 'equal', right: 'PSX' }],
        options: { lang: 'en' },
        markets: ['pakistan'],
        symbols: { query: { types: [] }, tickers: [] },
        columns: ['logoid', 'name'],
        sort: { sortBy: 'name', sortOrder: 'asc' },
        range: [start, start + pageSize],
      }),
    });
    if (!res.ok) throw new Error(`scanner HTTP ${res.status}`);
    const json = await res.json();
    total = json.totalCount || 0;
    for (const row of json.data || []) {
      const ticker = String(row.s || '')
        .replace(/^PSX:/i, '')
        .toUpperCase();
      const logoid = row.d?.[0];
      if (ticker && logoid && typeof logoid === 'string') out.set(ticker, logoid);
    }
    start += pageSize;
    await sleep(80);
  }
  return out;
}

function isBadLogoid(logoid) {
  if (!logoid || typeof logoid !== 'string') return true;
  return BAD_LOGOID_PREFIXES.some((p) => logoid.startsWith(p));
}

function isAcceptableLogo(buf, url, contentType) {
  if (!buf || buf.length < 200) return false;
  const hash = sha1(buf);
  if (PLACEHOLDER_SHA1.has(hash)) return false;

  const ct = (contentType || '').toLowerCase();
  const isSvg = url.endsWith('.svg') || ct.includes('svg');
  // Old PSX placeholder PNG was exactly 5680 bytes
  if (!isSvg && buf.length === 5680) return false;
  // Tiny error XML / HTML bodies
  const head = buf.slice(0, 80).toString('utf8').toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<error') || head.includes('<html')) {
    return false;
  }
  return true;
}

async function downloadBestLogo(logoid, symbol) {
  const candidates = [
    `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg`,
    `https://s3-symbol-logo.tradingview.com/${logoid}.svg`,
    `https://s3-symbol-logo.tradingview.com/${logoid}--big.png`,
    `https://s3-symbol-logo.tradingview.com/${logoid}--600.png`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'DividendFlowPK-logo-fetch/2.0' },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      if (!isAcceptableLogo(buf, url, ct)) continue;

      const isSvg = url.endsWith('.svg') || ct.toLowerCase().includes('svg');
      const ext = isSvg ? 'svg' : 'png';
      const dest = path.join(LOGO_DIR, `${symbol}.${ext}`);
      fs.writeFileSync(dest, buf);
      return { path: `/logos/${symbol}.${ext}`, bytes: buf.length, hash: sha1(buf), url };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });

  // Remove previous logo files so placeholders cannot linger
  for (const name of fs.readdirSync(LOGO_DIR)) {
    if (/\.(png|svg|jpg|jpeg|webp)$/i.test(name)) {
      fs.unlinkSync(path.join(LOGO_DIR, name));
    }
  }

  console.log('Fetching TradingView logoids…');
  const logoids = await fetchAllLogoids();
  console.log(`Got ${logoids.size} symbols with logoids`);

  const manifest = {};
  const hashCounts = new Map();
  let ok = 0;
  let miss = 0;
  let badId = 0;
  let i = 0;

  for (const [symbol, logoid] of [...logoids.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    i += 1;
    process.stdout.write(`[${i}/${logoids.size}] ${symbol} (${logoid}) … `);
    if (isBadLogoid(logoid)) {
      badId += 1;
      miss += 1;
      console.log('skip-bad-id');
      continue;
    }
    try {
      const result = await downloadBestLogo(logoid, symbol);
      if (result) {
        manifest[symbol] = result.path;
        hashCounts.set(result.hash, (hashCounts.get(result.hash) || 0) + 1);
        ok += 1;
        console.log(`ok ${result.bytes}b`);
      } else {
        miss += 1;
        console.log('miss');
      }
    } catch (err) {
      miss += 1;
      console.log(`err (${err.message})`);
    }
    await sleep(50);
  }

  // Drop any logos that share an identical hash across many symbols (generic placeholder)
  const sharedHashes = new Set(
    [...hashCounts.entries()].filter(([, n]) => n >= 8).map(([h]) => h)
  );
  if (sharedHashes.size) {
    console.log(`Purging ${sharedHashes.size} shared placeholder hash(es)…`);
    for (const [symbol, logoPath] of Object.entries(manifest)) {
      const abs = path.join(ROOT, 'frontend', 'public', logoPath.replace(/^\//, ''));
      if (!fs.existsSync(abs)) continue;
      const hash = sha1(fs.readFileSync(abs));
      if (sharedHashes.has(hash)) {
        fs.unlinkSync(abs);
        delete manifest[symbol];
        ok -= 1;
        miss += 1;
      }
    }
  }

  // Remove orphan opposite-extension files (e.g. leftover .png when .svg won)
  for (const name of fs.readdirSync(LOGO_DIR)) {
    if (!/\.(png|svg|jpg|jpeg|webp)$/i.test(name)) continue;
    const symbol = path.basename(name, path.extname(name)).toUpperCase();
    const expected = manifest[symbol];
    if (!expected) {
      fs.unlinkSync(path.join(LOGO_DIR, name));
      continue;
    }
    if (`/logos/${name}` !== expected) {
      fs.unlinkSync(path.join(LOGO_DIR, name));
    }
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Done. ${Object.keys(manifest).length} unique logos, ${miss} missing (${badId} bad ids). Manifest: ${MANIFEST_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

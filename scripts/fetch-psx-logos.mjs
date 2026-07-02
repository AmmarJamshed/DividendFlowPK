/**
 * One-time PSX company logo fetcher.
 * Sources: TradingView symbol logos, then PSX DPS company page og:image.
 *
 * Usage: node scripts/fetch-psx-logos.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LOGO_DIR = path.join(ROOT, 'frontend', 'public', 'logos');
const MANIFEST_PATH = path.join(ROOT, 'frontend', 'src', 'data', 'psxLogos.json');

const SYMBOL_SOURCES = [
  path.join(ROOT, 'psx_full_dataset.csv'),
  path.join(ROOT, 'prices', 'psx_full_dataset.csv'),
];

function loadSymbols() {
  for (const fp of SYMBOL_SOURCES) {
    if (!fs.existsSync(fp)) continue;
    const text = fs.readFileSync(fp, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = (lines[0] || '').toLowerCase();
    const symIdx = header.includes('symbol') ? header.split(',').indexOf('symbol') : 1;
    const symbols = new Set();
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      const sym = (cols[symIdx] || cols[1] || '').trim().replace(/"/g, '');
      if (sym && /^[A-Z0-9-]{2,12}$/.test(sym)) symbols.add(sym);
    }
    if (symbols.size) return [...symbols].sort();
  }
  return ['HBL', 'MCB', 'UBL', 'ENGRO', 'LUCK', 'PPL', 'OGDC', 'PSO', 'HUBC', 'FFC'];
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function tradingViewUrl(symbol) {
  const base = symbol.toLowerCase();
  const candidates = [
    `https://s3-symbol-logo.tradingview.com/${base}--big.svg`,
    `https://s3-symbol-logo.tradingview.com/${base}--big.png`,
  ];
  for (const url of candidates) {
    if (await headOk(url)) return url;
  }
  return null;
}

async function dpsLogoUrl(symbol) {
  try {
    const res = await fetch(`https://dps.psx.com.pk/company/${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'DividendFlowPK-logo-fetch/1.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const og = html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (og?.[1] && !og[1].includes('psx-logo')) return og[1];
    const img = html.match(/class="[^"]*company[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (img?.[1]) return img[1].startsWith('http') ? img[1] : `https://dps.psx.com.pk${img[1]}`;
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchLogo(symbol) {
  const tv = await tradingViewUrl(symbol);
  if (tv) {
    const ext = tv.endsWith('.png') ? 'png' : 'svg';
    const dest = path.join(LOGO_DIR, `${symbol}.${ext}`);
    await download(tv, dest);
    return `/logos/${symbol}.${ext}`;
  }

  const dps = await dpsLogoUrl(symbol);
  if (dps) {
    const ext = dps.includes('.png') ? 'png' : dps.includes('.jpg') ? 'jpg' : 'svg';
    const dest = path.join(LOGO_DIR, `${symbol}.${ext}`);
    await download(dps, dest);
    return `/logos/${symbol}.${ext}`;
  }

  return null;
}

async function main() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });

  const symbols = loadSymbols();
  const manifest = {};
  let ok = 0;
  let fail = 0;

  console.log(`Fetching logos for ${symbols.length} symbols…`);

  for (let i = 0; i < symbols.length; i += 1) {
    const symbol = symbols[i];
    process.stdout.write(`[${i + 1}/${symbols.length}] ${symbol} … `);
    try {
      const logoPath = await fetchLogo(symbol);
      if (logoPath) {
        manifest[symbol] = logoPath;
        ok += 1;
        console.log('ok');
      } else {
        fail += 1;
        console.log('miss');
      }
    } catch (err) {
      fail += 1;
      console.log(`err (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Done. ${ok} logos saved, ${fail} missing. Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

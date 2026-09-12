const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pathToFileURL } = require('url');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const AGENT = path.join(ROOT, 'scripts', 'market-research-agent.js');
const COVER = path.join(ROOT, 'docs', 'theme', 'dfpk-theme-01-title.png');

const NAVY = '#0b1f3a';
const BLUE = '#1a3a6b';
const ORANGE = '#f05a22';
const CREAM = '#fff8f2';
const INK = '#152033';
const MUTED = '#5a6a7e';
const SKY = '#e8f2ff';
const LINE = '#d6e0ef';

(function ensureAgentModulePaths() {
  const extras = [
    path.join(ROOT, 'backend', 'node_modules'),
    path.join(ROOT, 'scripts', 'node_modules'),
    path.join(ROOT, 'node_modules'),
  ].filter((p) => fs.existsSync(p));
  if (!extras.length) return;
  const merged = [...extras, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  process.env.NODE_PATH = [...new Set(merged)].join(path.delimiter);
  Module._initPaths();
})();

let agentModPromise = null;
function loadAgentMod() {
  if (!agentModPromise) agentModPromise = import(pathToFileURL(AGENT).href);
  return agentModPromise;
}

function chromeCandidates() {
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
}

async function launchBrowser() {
  const puppeteer = require('puppeteer-core');
  if (process.platform === 'linux') {
    try {
      const chromium = require('@sparticuz/chromium');
      return puppeteer.launch({
        args: [...chromium.args, '--disable-dev-shm-usage', '--font-render-hinting=none'],
        defaultViewport: { width: 1100, height: 1400, deviceScaleFactor: 1 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } catch (err) {
      console.warn('[researchPdf] @sparticuz/chromium launch failed', err.message);
    }
  }
  for (const exe of chromeCandidates()) {
    if (!fs.existsSync(exe)) continue;
    return puppeteer.launch({
      executablePath: exe,
      headless: true,
      defaultViewport: { width: 1100, height: 1400, deviceScaleFactor: 1 },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
  }
  throw new Error('No Chrome/Chromium executable found for HTML PDF');
}

function preparePrintHtml(html) {
  let out = html;
  if (fs.existsSync(COVER)) {
    const dataUri = `data:image/png;base64,${fs.readFileSync(COVER).toString('base64')}`;
    out = out.replace(/src="[^"]*dfpk-theme-01-title\.png"/i, `src="${dataUri}"`);
  }
  // Prevent </script> breakouts in chart JSON payloads already embedded by the template.
  out = out
    .replace(/const layers = (\[.*?\]);/s, (_, json) => `const layers = ${json.replace(/</g, '\\u003c')};`)
    .replace(/const scores = (\[.*?\]);/s, (_, json) => `const scores = ${json.replace(/</g, '\\u003c')};`)
    .replace(/const gaps = (\[.*?\]);/s, (_, json) => `const gaps = ${json.replace(/</g, '\\u003c')};`);

  const inject = `
<style>
  @page { margin: 12mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover { border-radius: 0 !important; }
  section, .cheat, .chart-box, .stock-card { break-inside: avoid; page-break-inside: avoid; }
</style>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { document.documentElement.setAttribute('data-pdf-ready', '1'); }, 400);
  });
</script>`;
  if (out.includes('</head>')) out = out.replace('</head>', `${inject}</head>`);
  else out = inject + out;
  return out;
}

async function buildPdfFromHtml(report) {
  const agent = await loadAgentMod();
  const html = preparePrintHtml(agent.renderHtml(report));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-pdf-ready') === '1' || !!window.Chart,
      { timeout: 15000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '12mm', left: '10mm' },
      preferCSSPageSize: false,
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close().catch(() => {});
  }
}

function ensureSpace(doc, need = 80) {
  if (doc.y + need < doc.page.height - doc.page.margins.bottom) return;
  doc.addPage();
}

function drawRoundedRect(doc, x, y, w, h, r, fill) {
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill(fill);
  doc.restore();
}

function drawHBars(doc, rows, { title, color = ORANGE, maxValue = null }) {
  if (!rows?.length) return;
  ensureSpace(doc, 40 + rows.length * 22);
  doc.fontSize(12).fillColor(NAVY).text(title, { underline: false });
  doc.moveDown(0.3);
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const labelW = Math.min(160, usable * 0.38);
  const barMax = usable - labelW - 36;
  const nums = rows.map((r) => Number(r.value) || 0);
  const peak = maxValue || Math.max(...nums, 1);
  for (const row of rows.slice(0, 8)) {
    ensureSpace(doc, 24);
    const y = doc.y;
    const val = Number(row.value) || 0;
    const w = Math.max(4, (val / peak) * barMax);
    doc.fontSize(8).fillColor(MUTED).text(String(row.label || '').slice(0, 28), left, y, {
      width: labelW,
      ellipsis: true,
    });
    drawRoundedRect(doc, left + labelW + 6, y + 2, w, 10, 3, color);
    doc.fontSize(8).fillColor(INK).text(String(row.value), left + labelW + 12 + w, y, { width: 40 });
    doc.y = y + 18;
  }
  doc.moveDown(0.4);
}

function buildBrandedPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 42,
      size: 'A4',
      info: { Title: report?.topic || 'Research report', Author: 'DividendFlow.pk' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const usable = pageW - doc.page.margins.left - doc.page.margins.right;

    // Cover band
    doc.rect(0, 0, pageW, 28).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(10).text('DIVIDEND FLOW.PK  ·  Research Lab', left, 9, {
      width: usable,
      align: 'left',
    });
    doc.fillColor(ORANGE).fontSize(10).text('Track · Learn · Grow', left, 9, { width: usable, align: 'right' });
    doc.y = 40;

    if (fs.existsSync(COVER)) {
      try {
        const imgW = usable;
        const imgH = 150;
        doc.image(COVER, left, doc.y, { width: imgW, height: imgH, fit: [imgW, imgH], align: 'center' });
        doc.y += imgH + 12;
      } catch {
        /* ignore image errors */
      }
    }

    doc.fontSize(18).fillColor(NAVY).text(report?.topic || 'Research report', { width: usable });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(MUTED).text(
      [
        `Geo: ${report?.geo || '—'}`,
        `Audience: ${report?.audience || '—'}`,
        `Generated: ${report?.generated_at || new Date().toISOString()}`,
        `Id: ${report?.slug || '—'}`,
      ].join('  ·  '),
      { width: usable }
    );
    doc.moveDown(0.5);

    // Disclaimer
    drawRoundedRect(doc, left, doc.y, usable, 36, 8, '#fff3e8');
    doc.fillColor(INK).fontSize(8).text(
      'Educational only — not SECP-registered advice. Numbers from public crawl evidence + DividendFlow market data.',
      left + 10,
      doc.y + 10,
      { width: usable - 20 }
    );
    doc.y += 48;

    const snap =
      report?.executive_snapshot ||
      report?.simple_word_answer ||
      report?.executive_summary ||
      '';
    if (snap) {
      ensureSpace(doc, 120);
      const boxTop = doc.y;
      doc.fontSize(9).fillColor('#ffffff');
      const snapHeight = Math.max(90, doc.heightOfString(String(snap), { width: usable - 24 }) + 56);
      drawRoundedRect(doc, left, boxTop, usable, snapHeight, 10, NAVY);
      doc.fillColor('#ffffff').fontSize(11).text('60-second executive snapshot', left + 12, boxTop + 12, {
        width: usable - 24,
      });
      doc.fillColor('#ffd2b8').fontSize(9).text(String(snap), left + 12, boxTop + 32, {
        width: usable - 24,
        lineGap: 2,
      });
      doc.y = boxTop + snapHeight + 12;
    }

    // Stat cards
    const layers = report?.market_layers || [];
    if (layers.length) {
      ensureSpace(doc, 70);
      const cards = layers.slice(0, 4);
      const gap = 8;
      const cardW = (usable - gap * (cards.length - 1)) / cards.length;
      const y = doc.y;
      cards.forEach((m, i) => {
        const x = left + i * (cardW + gap);
        drawRoundedRect(doc, x, y, cardW, 58, 8, SKY);
        doc.fillColor(ORANGE).fontSize(10).text(String(m.value || '').slice(0, 18), x + 6, y + 8, {
          width: cardW - 12,
        });
        doc.fillColor(BLUE).fontSize(7).text(String(m.label || '').slice(0, 40), x + 6, y + 26, {
          width: cardW - 12,
        });
        if (m.year) {
          doc.fillColor(MUTED).fontSize(7).text(String(m.year), x + 6, y + 42, { width: cardW - 12 });
        }
      });
      doc.y = y + 70;
    }

    const chartLayers = (report?.charts?.layers || []).map((d) => ({
      label: d.label,
      value: d.value,
    }));
    const chartScores = (report?.charts?.product_scores || report?.menu_or_product_scores || []).map((d) => ({
      label: d.label || d.name,
      value: d.value != null ? d.value : d.score,
    }));
    const chartGaps = (report?.charts?.gap_scores || report?.smart_gaps || []).map((d) => ({
      label: d.label || d.gap,
      value: d.value != null ? d.value : d.opportunity_score,
    }));
    const costSplit = (report?.economics?.cost_split_pct || []).map((d) => ({
      label: d.label,
      value: d.value,
    }));

    if (chartLayers.length) drawHBars(doc, chartLayers, { title: 'Market layers (chart)', color: ORANGE });
    if (chartScores.length) {
      drawHBars(doc, chartScores, { title: 'Product / opportunity scores', color: BLUE, maxValue: 100 });
    }
    if (costSplit.length) drawHBars(doc, costSplit, { title: 'Illustrative cost split %', color: ORANGE, maxValue: 100 });
    if (chartGaps.length) {
      drawHBars(doc, chartGaps, { title: 'Smart gap opportunity scores', color: NAVY, maxValue: 100 });
    }

    const section = (title) => {
      ensureSpace(doc, 50);
      doc.moveDown(0.35);
      doc.fontSize(12).fillColor(NAVY).text(title);
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(left + 80, doc.y + 2)
        .strokeColor(ORANGE)
        .lineWidth(2)
        .stroke();
      doc.moveDown(0.45);
    };
    const para = (text) => {
      if (!text) return;
      ensureSpace(doc, 40);
      doc.fontSize(9).fillColor(INK).text(String(text), { width: usable, lineGap: 2 });
      doc.moveDown(0.3);
    };
    const bullets = (items, fmt) => {
      for (const item of items || []) {
        const line = fmt(item);
        if (!line) continue;
        ensureSpace(doc, 28);
        doc.fontSize(9).fillColor(INK).text(`• ${line}`, { width: usable, lineGap: 1 });
      }
      doc.moveDown(0.2);
    };

    if (report?.economics) {
      section('Economics');
      if (report.economics.drivers?.length) {
        doc.fontSize(10).fillColor(BLUE).text('Drivers');
        bullets(report.economics.drivers, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
      }
      if (report.economics.restraints?.length) {
        doc.fontSize(10).fillColor(BLUE).text('Restraints');
        bullets(report.economics.restraints, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
      }
    }
    if (report?.barriers?.length) {
      section('Barriers to entry');
      bullets(report.barriers, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
    }
    if (report?.incentives?.length) {
      section('Incentives');
      bullets(report.incentives, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
    }
    if (report?.menu_or_product_scores?.length) {
      section('Product / menu fit scores');
      bullets(report.menu_or_product_scores, (p) => {
        const bits = [p.name, p.score != null ? `score ${p.score}` : null, p.verdict, p.rationale].filter(Boolean);
        return bits.join(' — ');
      });
    }
    if (report?.smart_gaps?.length) {
      section('Smart gaps');
      bullets(report.smart_gaps, (g) => {
        const score = g.opportunity_score != null ? ` (opportunity ${g.opportunity_score})` : '';
        return `${g.gap || g.idea || 'Gap'}${score}${g.who_pays ? ` · who pays: ${g.who_pays}` : ''}`;
      });
    }
    if (report?.interest_sections?.length) {
      section('Deep-dives on your interests');
      if (report.reader_interests) para(`You asked about: ${report.reader_interests}`);
      for (const sec of report.interest_sections.slice(0, 4)) {
        ensureSpace(doc, 60);
        drawRoundedRect(doc, left, doc.y, usable, 8, 4, CREAM);
        doc.fontSize(10).fillColor(NAVY).text(sec.title || 'Interest section');
        if (sec.related_to) doc.fontSize(8).fillColor(MUTED).text(`Related to: ${sec.related_to}`);
        if (sec.summary) para(sec.summary);
        bullets(sec.points || [], (p) => `${p.text || ''}${p.year ? ` [${p.year}]` : ''}`);
      }
    }
    if (report?.interest_extras?.length) {
      section('Extra angles');
      bullets(report.interest_extras, (x) => {
        const bits = [x.angle, x.why_it_matters, x.who_cares ? `who cares: ${x.who_cares}` : null, x.hook].filter(
          Boolean
        );
        return bits.join(' — ');
      });
    }

    const stocks = report?.stocks?.resolved || [];
    if (stocks.length) {
      section('Related PSX stocks');
      if (report?.stocks?.note) para(report.stocks.note);
      const cols = Math.min(3, stocks.length);
      const gap = 8;
      const cardW = (usable - gap * (cols - 1)) / cols;
      let i = 0;
      while (i < Math.min(stocks.length, 9)) {
        ensureSpace(doc, 70);
        const y = doc.y;
        for (let c = 0; c < cols && i < Math.min(stocks.length, 9); c += 1, i += 1) {
          const s = stocks[i];
          const x = left + c * (cardW + gap);
          drawRoundedRect(doc, x, y, cardW, 56, 8, CREAM);
          doc.fillColor(NAVY).fontSize(10).text(s.symbol || '', x + 8, y + 8, { width: cardW - 16 });
          doc
            .fillColor(ORANGE)
            .fontSize(11)
            .text(s.price != null ? `Rs ${s.price}` : '—', x + 8, y + 24, { width: cardW - 16 });
          doc
            .fillColor(MUTED)
            .fontSize(7)
            .text(
              [s.change_pct != null ? `${s.change_pct}%` : null, s.dividend_yield != null ? `yield ${s.dividend_yield}%` : null]
                .filter(Boolean)
                .join(' · '),
              x + 8,
              y + 40,
              { width: cardW - 16 }
            );
        }
        doc.y = y + 66;
      }
    }

    if (report?.sources?.length) {
      section('Sources');
      for (const src of report.sources.slice(0, 16)) {
        ensureSpace(doc, 36);
        doc.fontSize(8).fillColor(INK).text(`• ${src.title || src.url || 'Source'}${src.year ? ` (${src.year})` : ''}`, {
          width: usable,
        });
        if (src.url) doc.fillColor(BLUE).fontSize(7).text(`  ${src.url}`, { link: src.url, width: usable });
      }
    }

    doc.moveDown(0.8);
    doc.fontSize(8).fillColor(MUTED).text(
      'DividendFlow.pk · Educational only — not investment advice. Generated by Research Lab.',
      { width: usable, align: 'center' }
    );
    doc.end();
  });
}

async function buildResearchPdfBuffer(report) {
  try {
    const htmlPdf = await buildPdfFromHtml(report);
    if (htmlPdf?.length > 1000) return { buffer: htmlPdf, engine: 'html' };
  } catch (err) {
    console.warn('[researchPdf] HTML PDF failed, using branded PDFKit fallback:', err.message);
  }
  const buffer = await buildBrandedPdfBuffer(report);
  return { buffer, engine: 'pdfkit-branded' };
}

module.exports = {
  buildResearchPdfBuffer,
  buildPdfFromHtml,
  buildBrandedPdfBuffer,
};

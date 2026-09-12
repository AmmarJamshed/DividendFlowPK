const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getSupabase } = require('../db/supabaseClient');

const ROOT = path.join(__dirname, '..', '..');
const DATA_RESEARCH = path.join(ROOT, 'data', 'research');
const DOCS_RESEARCH = path.join(ROOT, 'docs', 'research');

function ensureDirs() {
  for (const d of [DATA_RESEARCH, DOCS_RESEARCH]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function localJsonPath(slug) {
  return path.join(DATA_RESEARCH, `${slug}.json`);
}

function localHtmlPath(slug) {
  return path.join(DOCS_RESEARCH, `${slug}-report.html`);
}

async function persistResearchReport({ slug, report, html }) {
  if (!slug || !html) return { ok: false, error: 'missing slug or html' };
  ensureDirs();
  try {
    if (report) {
      fs.writeFileSync(localJsonPath(slug), JSON.stringify(report, null, 2));
    }
    fs.writeFileSync(localHtmlPath(slug), html, 'utf8');
  } catch (err) {
    console.warn('[researchStore] local write failed', err.message);
  }

  const supabase = getSupabase();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, channel: 'local-only' };
  }

  const row = {
    slug,
    topic: report?.topic || slug,
    geo: report?.geo || null,
    audience: report?.audience || null,
    report_json: report || {},
    html,
    generated_at: report?.generated_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('research_reports').upsert(row, { onConflict: 'slug' });
  if (error) {
    console.error('[researchStore] supabase upsert failed', error.message);
    return { ok: false, error: error.message, channel: 'local' };
  }
  return { ok: true, channel: 'supabase' };
}

async function loadReportHtml(slug) {
  const local = localHtmlPath(slug);
  if (fs.existsSync(local)) {
    return { html: fs.readFileSync(local, 'utf8'), source: 'local' };
  }

  const supabase = getSupabase();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data, error } = await supabase
    .from('research_reports')
    .select('html')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data?.html) return null;
  ensureDirs();
  try {
    fs.writeFileSync(local, data.html, 'utf8');
  } catch {
    /* ignore cache write */
  }
  return { html: data.html, source: 'supabase' };
}

async function loadReportJson(slug) {
  const local = localJsonPath(slug);
  if (fs.existsSync(local)) {
    try {
      return JSON.parse(fs.readFileSync(local, 'utf8'));
    } catch {
      /* fall through */
    }
  }
  const supabase = getSupabase();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data, error } = await supabase
    .from('research_reports')
    .select('report_json, topic, geo, audience, generated_at, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ...(data.report_json || {}),
    slug: data.slug,
    topic: data.topic,
    geo: data.geo,
    audience: data.audience,
    generated_at: data.generated_at,
  };
}

async function listResearchReports() {
  const bySlug = new Map();

  ensureDirs();
  if (fs.existsSync(DATA_RESEARCH)) {
    for (const f of fs.readdirSync(DATA_RESEARCH)) {
      if (!f.endsWith('.json') || f === '_freshness.json' || f === 'research-subscribers.json') continue;
      try {
        const r = JSON.parse(fs.readFileSync(path.join(DATA_RESEARCH, f), 'utf8'));
        if (!r?.slug) continue;
        bySlug.set(r.slug, {
          slug: r.slug,
          topic: r.topic,
          geo: r.geo,
          audience: r.audience,
          generated_at: r.generated_at,
          stocks_count: r.stocks?.resolved?.length || 0,
        });
      } catch {
        /* ignore */
      }
    }
  }

  const supabase = getSupabase();
  if (supabase && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await supabase
      .from('research_reports')
      .select('slug, topic, geo, audience, generated_at, report_json')
      .order('generated_at', { ascending: false })
      .limit(100);
    for (const row of data || []) {
      const stocks = row.report_json?.stocks?.resolved?.length || 0;
      bySlug.set(row.slug, {
        slug: row.slug,
        topic: row.topic,
        geo: row.geo,
        audience: row.audience,
        generated_at: row.generated_at,
        stocks_count: stocks,
      });
    }
  }

  return [...bySlug.values()].sort((a, b) =>
    String(b.generated_at || '').localeCompare(String(a.generated_at || ''))
  );
}

function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: report?.topic || 'Research report' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title = report?.topic || 'DividendFlow research report';
    doc.fontSize(20).fillColor('#0a0e14').text('DividendFlow PK', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(16).text(title);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155').text(
      [
        `Audience: ${report?.audience || '—'}`,
        `Geo: ${report?.geo || '—'}`,
        `Generated: ${report?.generated_at || new Date().toISOString()}`,
        `Slug: ${report?.slug || '—'}`,
      ].join('\n')
    );
    doc.moveDown();

    const swa = report?.simple_word_answer || report?.executive_summary || '';
    if (swa) {
      doc.fontSize(12).fillColor('#0a0e14').text('Simple Word answer', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#1e293b').text(String(swa), { align: 'left' });
      doc.moveDown();
    }

    const layers = report?.market_layers || report?.key_stats || [];
    if (Array.isArray(layers) && layers.length) {
      doc.fontSize(12).fillColor('#0a0e14').text('Key figures', { underline: true });
      doc.moveDown(0.3);
      for (const layer of layers.slice(0, 12)) {
        const label = layer.label || layer.title || 'Fact';
        const value = layer.value || layer.stat || '';
        const year = layer.year ? ` (${layer.year})` : '';
        doc.fontSize(10).fillColor('#1e293b').text(`• ${label}: ${value}${year}`);
      }
      doc.moveDown();
    }

    const stocks = report?.stocks?.resolved || [];
    if (stocks.length) {
      doc.fontSize(12).fillColor('#0a0e14').text('PSX stock join', { underline: true });
      doc.moveDown(0.3);
      for (const s of stocks.slice(0, 20)) {
        const price = s.price != null ? `Rs ${s.price}` : '—';
        const ch = s.change_pct != null ? ` (${s.change_pct}%)` : '';
        doc.fontSize(10).fillColor('#1e293b').text(`• ${s.symbol}: ${price}${ch}`);
      }
      doc.moveDown();
    }

    const sources = report?.sources || [];
    if (Array.isArray(sources) && sources.length) {
      doc.fontSize(12).fillColor('#0a0e14').text('Sources', { underline: true });
      doc.moveDown(0.3);
      for (const src of sources.slice(0, 15)) {
        doc.fontSize(9).fillColor('#334155').text(
          `• ${src.title || src.url || 'Source'}${src.year ? ` (${src.year})` : ''}`
        );
        if (src.url) doc.fillColor('#1E3A8A').text(`  ${src.url}`, { link: src.url });
      }
      doc.moveDown();
    }

    doc.fontSize(8).fillColor('#64748b').text(
      'Educational only — not investment advice. Generated by DividendFlow.pk Research Lab.',
      { align: 'left' }
    );
    doc.end();
  });
}

async function loadReportPdf(slug) {
  const report = await loadReportJson(slug);
  if (!report) return null;
  const buffer = await buildPdfBuffer(report);
  return { buffer, filename: `${slug}-report.pdf`, report };
}

module.exports = {
  DATA_RESEARCH,
  DOCS_RESEARCH,
  persistResearchReport,
  loadReportHtml,
  loadReportJson,
  listResearchReports,
  loadReportPdf,
  buildPdfBuffer,
  localHtmlPath,
  localJsonPath,
};

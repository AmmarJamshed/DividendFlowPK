const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const Module = require('module');
const PDFDocument = require('pdfkit');
const { getSupabase } = require('../db/supabaseClient');
const {
  isSafeResearchSlug,
  assertSafeResearchSlug,
  containedJoin,
} = require('../utils/researchPaths');

const ROOT = path.join(__dirname, '..', '..');
const DATA_RESEARCH = path.join(ROOT, 'data', 'research');
const DOCS_RESEARCH = path.join(ROOT, 'docs', 'research');
const AGENT = path.join(ROOT, 'scripts', 'market-research-agent.js');

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

function reportRichness(report) {
  if (!report) return 0;
  let score = 0;
  if (String(report.executive_snapshot || '').length >= 40) score += 2;
  score += Math.min(4, (report.market_layers || []).length);
  score += Math.min(3, (report.barriers || []).length);
  score += Math.min(3, (report.incentives || []).length);
  score += Math.min(4, (report.menu_or_product_scores || []).length);
  score += Math.min(3, (report.smart_gaps || []).length);
  score += Math.min(2, (report.economics?.drivers || []).length);
  score += Math.min(4, (report.sources || []).length);
  return score;
}

function ensureDirs() {
  for (const d of [DATA_RESEARCH, DOCS_RESEARCH]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function localJsonPath(slug) {
  assertSafeResearchSlug(slug);
  return containedJoin(DATA_RESEARCH, `${slug}.json`);
}

function localHtmlPath(slug) {
  assertSafeResearchSlug(slug);
  return containedJoin(DOCS_RESEARCH, `${slug}-report.html`);
}

async function persistResearchReport({ slug, report, html }) {
  if (!slug || !html) return { ok: false, error: 'missing slug or html' };
  if (!isSafeResearchSlug(slug)) return { ok: false, error: 'invalid slug' };
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

/** Thin Groq stubs get expanded into a full research pack before PDF/HTML delivery. */
async function ensureFullReport(report) {
  if (!report?.slug) return report;
  const agent = await loadAgentMod();
  if (agent.isReportComplete(report)) return report;

  const topic = report.topic || report.slug;
  const geo = report.geo || 'Pakistan';
  const audience = report.audience || 'market_researcher';
  const symbols = agent.heuristicSymbols(
    topic,
    report.stocks?.symbols_requested || report.symbols || []
  );
  const stocks = report.stocks?.resolved?.length
    ? report.stocks
    : agent.loadStockSnapshot(symbols);
  const evidence = (report.sources || []).map((s) => ({
    title: s.title,
    url: s.url,
    year: s.year,
    excerpt: s.excerpt || '',
  }));
  const offlineBase = agent.buildOfflineReport({
    topic,
    geo,
    audience,
    symbols,
    stocks,
    evidence,
    interests: report.reader_interests || report.crawl_meta?.interests || '',
  });
  const full = agent.mergeWithOfflineBase(report, offlineBase);
  full.slug = report.slug;
  full.generated_at = new Date().toISOString();
  if (!Array.isArray(full.interest_sections) || !full.interest_sections.length) {
    full.interest_sections = offlineBase.interest_sections;
  }
  full.crawl_meta = {
    ...(full.crawl_meta || {}),
    repaired_at: new Date().toISOString(),
    repaired_from: 'thin-stored-report',
  };

  try {
    const html = agent.renderHtml(full);
    await persistResearchReport({ slug: full.slug, report: full, html });
  } catch (err) {
    console.warn('[researchStore] repair persist failed', err.message);
  }
  return full;
}

async function loadReportJsonRaw(slug) {
  if (!isSafeResearchSlug(slug)) return null;
  let localReport = null;
  const local = localJsonPath(slug);
  if (fs.existsSync(local)) {
    try {
      localReport = JSON.parse(fs.readFileSync(local, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  let remoteReport = null;
  const supabase = getSupabase();
  if (supabase && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await supabase
      .from('research_reports')
      .select('report_json, topic, geo, audience, generated_at, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (!error && data) {
      remoteReport = {
        ...(data.report_json || {}),
        slug: data.slug,
        topic: data.topic,
        geo: data.geo,
        audience: data.audience,
        generated_at: data.generated_at,
      };
    }
  }

  if (localReport && remoteReport) {
    return reportRichness(localReport) >= reportRichness(remoteReport) ? localReport : remoteReport;
  }
  return localReport || remoteReport;
}

async function loadReportJson(slug) {
  const raw = await loadReportJsonRaw(slug);
  if (!raw) return null;
  return ensureFullReport(raw);
}

async function loadReportHtml(slug) {
  if (!isSafeResearchSlug(slug)) return null;
  const report = await loadReportJson(slug);
  if (report) {
    const agent = await loadAgentMod();
    return { html: agent.renderHtml(report), source: 'ensured' };
  }

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
  return { html: data.html, source: 'supabase' };
}

async function listResearchReports() {
  const bySlug = new Map();

  ensureDirs();
  if (fs.existsSync(DATA_RESEARCH)) {
    for (const f of fs.readdirSync(DATA_RESEARCH)) {
      if (!f.endsWith('.json') || f === '_freshness.json' || f === 'research-subscribers.json') continue;
      const fileSlug = f.slice(0, -'.json'.length);
      if (!isSafeResearchSlug(fileSlug)) continue;
      try {
        const r = JSON.parse(fs.readFileSync(containedJoin(DATA_RESEARCH, f), 'utf8'));
        if (!r?.slug || !isSafeResearchSlug(r.slug)) continue;
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
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: report?.topic || 'Research report' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const section = (title) => {
      doc.moveDown(0.6);
      doc.fontSize(13).fillColor('#0a0e14').text(title, { underline: true });
      doc.moveDown(0.25);
    };
    const para = (text) => {
      if (!text) return;
      doc.fontSize(10).fillColor('#1e293b').text(String(text), { align: 'left', lineGap: 2 });
      doc.moveDown(0.35);
    };
    const bullets = (items, fmt) => {
      for (const item of items || []) {
        const line = fmt(item);
        if (!line) continue;
        doc.fontSize(10).fillColor('#1e293b').text(`• ${line}`, { align: 'left', lineGap: 1 });
      }
      doc.moveDown(0.25);
    };

    const title = report?.topic || 'DividendFlow research report';
    doc.fontSize(18).fillColor('#0a0e14').text('DividendFlow PK — Research Lab');
    doc.moveDown(0.25);
    doc.fontSize(15).text(title);
    doc.moveDown(0.35);
    doc.fontSize(9).fillColor('#64748b').text(
      [
        `Audience: ${report?.audience || '—'}`,
        `Geo: ${report?.geo || '—'}`,
        `Generated: ${report?.generated_at || new Date().toISOString()}`,
        `Report id: ${report?.slug || '—'}`,
      ].join('  ·  ')
    );

    const snap =
      report?.executive_snapshot ||
      report?.simple_word_answer ||
      report?.executive_summary ||
      '';
    if (snap) {
      section('Simple Word answer');
      para(snap);
    }

    const layers = report?.market_layers || report?.key_stats || [];
    if (Array.isArray(layers) && layers.length) {
      section('Market layers / key figures');
      bullets(layers.slice(0, 16), (layer) => {
        const label = layer.label || layer.title || 'Fact';
        const value = layer.value || layer.stat || '';
        const year = layer.year ? ` (${layer.year})` : '';
        return `${label}: ${value}${year}`;
      });
    }

    if (report?.economics) {
      section('Economics');
      if (report.economics.drivers?.length) {
        doc.fontSize(10).fillColor('#0a0e14').text('Drivers');
        bullets(report.economics.drivers, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
      }
      if (report.economics.restraints?.length) {
        doc.fontSize(10).fillColor('#0a0e14').text('Restraints');
        bullets(report.economics.restraints, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
      }
      if (report.economics.cost_split_pct?.length) {
        doc.fontSize(10).fillColor('#0a0e14').text('Illustrative cost split');
        bullets(report.economics.cost_split_pct, (x) => `${x.label}: ${x.value}%`);
      }
    }

    if (report?.barriers?.length) {
      section('Barriers');
      bullets(report.barriers, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
    }
    if (report?.incentives?.length) {
      section('Incentives');
      bullets(report.incentives, (x) => `${x.text || ''}${x.year ? ` [${x.year}]` : ''}`);
    }

    if (report?.menu_or_product_scores?.length) {
      section('Product / menu scores');
      bullets(report.menu_or_product_scores, (p) => {
        const bits = [p.name, p.score != null ? `score ${p.score}` : null, p.verdict, p.rationale]
          .filter(Boolean);
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
      if (report.reader_interests) {
        para(`You asked about: ${report.reader_interests}`);
      }
      for (const sec of report.interest_sections.slice(0, 4)) {
        doc.fontSize(11).fillColor('#0a0e14').text(sec.title || 'Interest section');
        if (sec.related_to) {
          doc.fontSize(9).fillColor('#64748b').text(`Related to: ${sec.related_to}`);
        }
        if (sec.summary) para(sec.summary);
        bullets(sec.points || [], (p) => `${p.text || ''}${p.year ? ` [${p.year}]` : ''}`);
      }
    }

    if (report?.interest_extras?.length) {
      section('If this still isn’t quite what you wanted');
      bullets(report.interest_extras, (x) => {
        const bits = [x.angle, x.why_it_matters, x.who_cares ? `who cares: ${x.who_cares}` : null, x.hook]
          .filter(Boolean);
        return bits.join(' — ');
      });
    }

    const stocks = report?.stocks?.resolved || [];
    if (stocks.length) {
      section('PSX stock join');
      if (report?.stocks?.note) para(report.stocks.note);
      bullets(stocks.slice(0, 24), (s) => {
        const price = s.price != null ? `Rs ${s.price}` : '—';
        const ch = s.change_pct != null ? ` (${s.change_pct}%)` : '';
        const yld = s.dividend_yield != null ? ` · yield ${s.dividend_yield}%` : '';
        return `${s.symbol}${s.name ? ` (${s.name})` : ''}: ${price}${ch}${yld}`;
      });
    }

    const sources = report?.sources || [];
    if (sources.length) {
      section('Sources');
      for (const src of sources.slice(0, 20)) {
        doc.fontSize(9).fillColor('#334155').text(
          `• ${src.title || src.url || 'Source'}${src.year ? ` (${src.year})` : ''}`
        );
        if (src.url) doc.fillColor('#1E3A8A').text(`  ${src.url}`, { link: src.url });
        if (src.excerpt) {
          doc.fontSize(8).fillColor('#64748b').text(`  ${String(src.excerpt).slice(0, 180)}`);
        }
      }
      doc.moveDown(0.3);
    }

    if (report?.ml_notes) {
      section('Notes');
      para(report.ml_notes);
    }

    doc.moveDown(0.5);
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
  ensureFullReport,
  localHtmlPath,
  localJsonPath,
};

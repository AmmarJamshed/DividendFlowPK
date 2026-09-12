const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  isValidEmail,
  isEmailConfiguredAsync,
  resolveResendApiKey,
  sendResearchReportEmail,
} = require('../../services/researchMail');

const router = express.Router();

const ROOT = path.join(__dirname, '..', '..', '..');
const DATA_RESEARCH = path.join(ROOT, 'data', 'research');
const JOBS_DIR = path.join(DATA_RESEARCH, 'jobs');
const DOCS_RESEARCH = path.join(ROOT, 'docs', 'research');
const AGENT = path.join(ROOT, 'scripts', 'market-research-agent.js');

/** In-flight jobs on this process (survives browser close; cleared on dyno restart). */
const runningJobs = new Set();

function ensureDirs() {
  for (const d of [DATA_RESEARCH, JOBS_DIR, DOCS_RESEARCH]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJobPatch(jobId, patch) {
  const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
  const cur = readJsonSafe(jobPath) || {};
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(jobPath, JSON.stringify(next, null, 2));
  return next;
}

function listReports() {
  ensureDirs();
  if (!fs.existsSync(DATA_RESEARCH)) return [];
  return fs
    .readdirSync(DATA_RESEARCH)
    .filter((f) => f.endsWith('.json') && f !== '_freshness.json' && f !== 'research-subscribers.json')
    .map((f) => {
      const r = readJsonSafe(path.join(DATA_RESEARCH, f));
      if (!r?.slug) return null;
      return {
        slug: r.slug,
        topic: r.topic,
        geo: r.geo,
        audience: r.audience,
        generated_at: r.generated_at,
        stocks_count: r.stocks?.resolved?.length || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')));
}

async function loadAgent() {
  return import(pathToFileURL(AGENT).href);
}

/**
 * Runs fully on the server (no browser required). Completes crawl → HTML/JSON → email.
 */
async function executeResearchJob(jobId) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
  const job = readJsonSafe(jobPath);
  if (!job) {
    runningJobs.delete(jobId);
    return;
  }

  writeJobPatch(jobId, {
    status: 'running',
    worker: 'in-process',
    started_at: new Date().toISOString(),
  });

  try {
    const agent = await loadAgent();
    const result = await agent.runMarketResearch({
      topic: job.topic,
      audience: job.audience || 'market_researcher',
      geo: job.geo || 'Pakistan',
      symbols: job.symbols || [],
      offline: Boolean(job.offline),
      jobId,
    });

    const slug = result.slug || result.report?.slug;
    writeJobPatch(jobId, {
      status: 'completed',
      slug,
      html_url: result.html_url || (slug ? `/api/v1/research/reports/${slug}/html` : null),
      evidence_count: result.evidence_count,
      stocks_resolved: result.stocks_resolved,
      completed_at: new Date().toISOString(),
    });

    const latest = readJsonSafe(jobPath);
    if (latest?.email && !latest.email_sent && slug) {
      const mail = await sendResearchReportEmail({
        email: latest.email,
        topic: latest.topic,
        slug,
        audience: latest.audience,
      });
      writeJobPatch(jobId, {
        email_sent: Boolean(mail.ok),
        email_channel: mail.channel,
        email_error: mail.error || null,
        report_url: mail.url || null,
        emailed_at: mail.ok ? new Date().toISOString() : null,
      });
    }
  } catch (err) {
    console.error('[research] job failed', jobId, err);
    writeJobPatch(jobId, {
      status: 'failed',
      error: err.message || String(err),
      failed_at: new Date().toISOString(),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

function enqueueResearchJob(payload) {
  ensureDirs();
  const jobId = payload.jobId || crypto.randomBytes(8).toString('hex');
  const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
  fs.writeFileSync(
    jobPath,
    JSON.stringify(
      {
        id: jobId,
        status: 'queued',
        topic: payload.topic,
        audience: payload.audience,
        symbols: payload.symbols || [],
        geo: payload.geo,
        offline: Boolean(payload.offline),
        email: payload.email || null,
        email_sent: false,
        worker: 'in-process',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // Fire-and-forget: HTTP returns immediately; work continues after the client leaves.
  setImmediate(() => {
    executeResearchJob(jobId).catch((err) => {
      console.error('[research] unhandled job error', jobId, err);
      writeJobPatch(jobId, { status: 'failed', error: err.message || String(err) });
    });
  });

  return { jobId, jobPath };
}

router.get('/status', async (_req, res) => {
  await resolveResendApiKey();
  const emailOk = await isEmailConfiguredAsync();
  res.json({
    ok: true,
    email_configured: emailOk,
    email_from:
      process.env.RESEND_FROM ||
      process.env.CONTACT_EMAIL_FROM ||
      process.env.AUTH_EMAIL_FROM ||
      'DividendFlow PK <noreply@dividendflow.pk>',
    public_site_url: process.env.PUBLIC_SITE_URL || null,
    worker: 'in-process',
    note: emailOk
      ? 'Reports are generated on the server and emailed when ready — you can close the tab.'
      : 'Set RESEND_API_KEY on the backend (or private.app_secrets) so reports can be emailed.',
  });
});

router.post('/jobs', async (req, res) => {
  try {
    const topic = String(req.body?.topic || '').trim();
    if (!topic) return res.status(400).json({ error: 'topic is required' });
    const audience = String(req.body?.audience || 'market_researcher').trim();
    const geo = String(req.body?.geo || 'Pakistan').trim();
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    if (!emailRaw || !isValidEmail(emailRaw)) {
      return res.status(400).json({ error: 'valid email is required to receive the report' });
    }
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols.map((s) => String(s).toUpperCase().trim()).filter(Boolean)
      : String(req.body?.symbols || '')
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
    const offline = Boolean(req.body?.offline);
    const emailReady = await isEmailConfiguredAsync();
    const { jobId } = enqueueResearchJob({
      topic,
      audience,
      symbols,
      geo,
      offline,
      email: emailRaw,
    });
    return res.status(202).json({
      id: jobId,
      status: 'queued',
      email: emailRaw,
      email_delivery: emailReady
        ? 'will_send_when_ready'
        : 'queued_but_server_email_not_configured',
      browser_required: false,
      message: emailReady
        ? 'Job queued on the server. You can close this page — we will email the report when it is ready.'
        : 'Job queued on the server, but email is not configured yet. Report will still be generated; email may fail until configured.',
      poll: `/api/v1/research/jobs/${jobId}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/reports/:slug/email', async (req, res) => {
  try {
    const slug = req.params.slug;
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'valid email is required' });
    const report = readJsonSafe(path.join(DATA_RESEARCH, `${slug}.json`));
    if (!report) return res.status(404).json({ error: 'report not found' });
    const mail = await sendResearchReportEmail({
      email,
      topic: report.topic,
      slug: report.slug,
      audience: report.audience,
    });
    if (!mail.ok) {
      return res.status(503).json({
        error: mail.error || 'email not sent',
        channel: mail.channel,
        report_url: mail.url,
      });
    }
    return res.json({ ok: true, channel: mail.channel, report_url: mail.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', (req, res) => {
  ensureDirs();
  const job = readJsonSafe(path.join(JOBS_DIR, `${req.params.id}.json`));
  if (!job) return res.status(404).json({ error: 'job not found' });
  return res.json(job);
});

router.get('/reports', (_req, res) => {
  try {
    return res.json({ reports: listReports() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/:slug', (req, res) => {
  ensureDirs();
  const report = readJsonSafe(path.join(DATA_RESEARCH, `${req.params.slug}.json`));
  if (!report) return res.status(404).json({ error: 'report not found' });
  return res.json({
    report,
    html_path: path.join(DOCS_RESEARCH, `${req.params.slug}-report.html`),
    html_url: `/api/v1/research/reports/${req.params.slug}/html`,
  });
});

router.get('/reports/:slug/html', (req, res) => {
  const file = path.join(DOCS_RESEARCH, `${req.params.slug}-report.html`);
  if (!fs.existsSync(file)) return res.status(404).send('Report HTML not found');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(fs.readFileSync(file, 'utf8'));
});

router.get('/reports/:slug/stocks', (req, res) => {
  const report = readJsonSafe(path.join(DATA_RESEARCH, `${req.params.slug}.json`));
  if (!report) return res.status(404).json({ error: 'report not found' });
  return res.json(report.stocks || { symbols_requested: [], resolved: [], note: 'missing' });
});

module.exports = router;

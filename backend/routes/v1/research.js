const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  isValidEmail,
  isEmailConfigured,
  sendResearchReportEmail,
} = require('../../services/researchMail');

const router = express.Router();

const ROOT = path.join(__dirname, '..', '..', '..');
const DATA_RESEARCH = path.join(ROOT, 'data', 'research');
const JOBS_DIR = path.join(DATA_RESEARCH, 'jobs');
const DOCS_RESEARCH = path.join(ROOT, 'docs', 'research');
const AGENT = path.join(ROOT, 'scripts', 'market-research-agent.js');

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

function watchJobAndEmail(jobId) {
  const started = Date.now();
  const maxMs = 8 * 60 * 1000;
  const timer = setInterval(async () => {
    const job = readJsonSafe(path.join(JOBS_DIR, `${jobId}.json`));
    if (!job) return;
    if (Date.now() - started > maxMs) {
      clearInterval(timer);
      if (job.status !== 'completed') {
        writeJobPatch(jobId, { status: 'failed', error: 'timeout waiting for research worker' });
      }
      return;
    }
    if (job.status === 'completed') {
      clearInterval(timer);
      if (job.email && !job.email_sent) {
        const mail = await sendResearchReportEmail({
          email: job.email,
          topic: job.topic,
          slug: job.slug,
          audience: job.audience,
        });
        writeJobPatch(jobId, {
          email_sent: Boolean(mail.ok),
          email_channel: mail.channel,
          email_error: mail.error || null,
          report_url: mail.url || null,
        });
      }
      return;
    }
    if (job.status === 'failed') {
      clearInterval(timer);
    }
  }, 2500);
}

function spawnResearchJob({ jobId, topic, audience, symbols, geo, offline, email }) {
  ensureDirs();
  const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
  fs.writeFileSync(
    jobPath,
    JSON.stringify(
      {
        id: jobId,
        status: 'queued',
        topic,
        audience,
        symbols,
        geo,
        email: email || null,
        email_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const args = [
    AGENT,
    '--topic',
    topic,
    '--audience',
    audience || 'market_researcher',
    '--geo',
    geo || 'Pakistan',
    '--job-id',
    jobId,
  ];
  if (symbols?.length) {
    args.push('--symbols', symbols.join(','));
  }
  if (offline) args.push('--offline');

  const child = spawn(process.execPath, args, {
    cwd: path.join(ROOT, 'scripts'),
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  if (email) watchJobAndEmail(jobId);

  return jobPath;
}

router.post('/jobs', (req, res) => {
  try {
    const topic = String(req.body?.topic || '').trim();
    if (!topic) return res.status(400).json({ error: 'topic is required' });
    const audience = String(req.body?.audience || 'market_researcher').trim();
    const geo = String(req.body?.geo || 'Pakistan').trim();
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const email = emailRaw ? emailRaw : null;
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'valid email is required to receive the report' });
    }
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols.map((s) => String(s).toUpperCase().trim()).filter(Boolean)
      : String(req.body?.symbols || '')
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
    const offline = Boolean(req.body?.offline);
    const jobId = crypto.randomBytes(8).toString('hex');
    spawnResearchJob({ jobId, topic, audience, symbols, geo, offline, email });
    return res.status(202).json({
      id: jobId,
      status: 'queued',
      email: email || null,
      email_delivery: email
        ? isEmailConfigured()
          ? 'will_send_when_ready'
          : 'queued_but_server_email_not_configured'
        : 'skipped',
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

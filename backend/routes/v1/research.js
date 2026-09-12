const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const Module = require('module');
const {
  isValidEmail,
  isEmailConfiguredAsync,
  resolveResendApiKey,
  sendResearchReportEmail,
  reportPublicUrl,
  reportPdfPublicUrl,
} = require('../../services/researchMail');
const {
  persistResearchReport,
  loadReportHtml,
  loadReportJson,
  listResearchReports,
  loadReportPdf,
  localHtmlPath,
} = require('../../services/researchStore');

const router = express.Router();

const ROOT = path.join(__dirname, '..', '..', '..');
const DATA_RESEARCH = path.join(ROOT, 'data', 'research');
const JOBS_DIR = path.join(DATA_RESEARCH, 'jobs');
const AGENT = path.join(ROOT, 'scripts', 'market-research-agent.js');

/** Let the ESM research agent resolve deps from backend + scripts node_modules (Render layout). */
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

const runningJobs = new Set();

function ensureDirs() {
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
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

async function loadAgent() {
  return import(pathToFileURL(AGENT).href);
}

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
      interests: job.interests || '',
      jobId,
    });

    const slug = result.slug || result.report?.slug;
    const report = result.report || (slug ? await loadReportJson(slug) : null);
    let html = null;
    if (slug && fs.existsSync(localHtmlPath(slug))) {
      html = fs.readFileSync(localHtmlPath(slug), 'utf8');
    }
    if (slug && html) {
      await persistResearchReport({ slug, report, html });
    }

    writeJobPatch(jobId, {
      status: 'completed',
      slug,
      html_url: slug ? reportPublicUrl(slug) : null,
      pdf_url: slug ? reportPdfPublicUrl(slug) : null,
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
        report,
        html,
      });
      writeJobPatch(jobId, {
        email_sent: Boolean(mail.ok),
        email_channel: mail.channel,
        email_error: mail.error || null,
        report_url: mail.url || null,
        pdf_url: mail.pdf_url || null,
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
        interests: payload.interests || null,
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
    public_site_url: process.env.PUBLIC_SITE_URL || 'https://dividendflow.pk',
    public_api_url: process.env.PUBLIC_API_URL || 'https://dividendflow-backend.onrender.com/api',
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
    const interests = String(req.body?.interests || '').trim();
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
      interests,
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
        ? 'Job queued on the server. You can close this page — we will email the PDF/report when it is ready.'
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
    const report = await loadReportJson(slug);
    if (!report) return res.status(404).json({ error: 'report not found' });
    const htmlPack = await loadReportHtml(slug);
    const mail = await sendResearchReportEmail({
      email,
      topic: report.topic,
      slug: report.slug,
      audience: report.audience,
      report,
      html: htmlPack?.html,
    });
    if (!mail.ok) {
      return res.status(503).json({
        error: mail.error || 'email not sent',
        channel: mail.channel,
        report_url: mail.url,
        pdf_url: mail.pdf_url,
      });
    }
    return res.json({
      ok: true,
      channel: mail.channel,
      report_url: mail.url,
      pdf_url: mail.pdf_url,
    });
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

router.get('/reports', async (_req, res) => {
  try {
    return res.json({ reports: await listResearchReports() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/:slug', async (req, res) => {
  const report = await loadReportJson(req.params.slug);
  if (!report) return res.status(404).json({ error: 'report not found' });
  return res.json({
    report,
    html_url: reportPublicUrl(report.slug),
    pdf_url: reportPdfPublicUrl(report.slug),
  });
});

router.get('/reports/:slug/html', async (req, res) => {
  const pack = await loadReportHtml(req.params.slug);
  if (!pack?.html) return res.status(404).send('Report HTML not found');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.send(pack.html);
});

router.get('/reports/:slug/pdf', async (req, res) => {
  try {
    const pack = await loadReportPdf(req.params.slug);
    if (!pack?.buffer) return res.status(404).send('Report PDF not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pack.filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(pack.buffer);
  } catch (err) {
    return res.status(500).send(err.message || 'PDF failed');
  }
});

router.get('/reports/:slug/stocks', async (req, res) => {
  const report = await loadReportJson(req.params.slug);
  if (!report) return res.status(404).json({ error: 'report not found' });
  return res.json(report.stocks || { symbols_requested: [], resolved: [], note: 'missing' });
});

module.exports = router;

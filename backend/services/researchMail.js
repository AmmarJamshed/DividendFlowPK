const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { BRAND, buildBrandedEmailHtml, escapeHtml } = require('./emailBrand');
const { getSupabase } = require('../db/supabaseClient');

const SITE = process.env.PUBLIC_SITE_URL || BRAND.siteUrl || 'https://dividendflow.pk';
const API_PUBLIC = (process.env.PUBLIC_API_URL || process.env.REACT_APP_API_URL || `${SITE}/api`).replace(/\/$/, '');

const secretCache = { loadedAt: 0, resendKey: null, resendFrom: null };

function defaultFrom() {
  return (
    secretCache.resendFrom ||
    process.env.RESEND_FROM ||
    process.env.CONTACT_EMAIL_FROM ||
    process.env.AUTH_EMAIL_FROM ||
    'DividendFlow PK <noreply@dividendflow.pk>'
  );
}

function supabaseEmailUrl() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/functions/v1/send-app-email`;
}

async function loadSecretsFromSupabase() {
  const now = Date.now();
  if (secretCache.loadedAt && now - secretCache.loadedAt < 5 * 60 * 1000) {
    return secretCache;
  }
  const supabase = getSupabase();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    secretCache.loadedAt = now;
    return secretCache;
  }
  try {
    const [keyRes, fromRes] = await Promise.all([
      supabase.rpc('get_app_secret', { p_key: 'RESEND_API_KEY' }),
      supabase.rpc('get_app_secret', { p_key: 'RESEND_FROM' }),
    ]);
    if (!keyRes.error && keyRes.data) secretCache.resendKey = String(keyRes.data);
    if (!fromRes.error && fromRes.data) secretCache.resendFrom = String(fromRes.data);
  } catch (err) {
    console.warn('[researchMail] secret load failed', err.message);
  }
  secretCache.loadedAt = now;
  return secretCache;
}

async function resolveResendApiKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const secrets = await loadSecretsFromSupabase();
  return secrets.resendKey || null;
}

async function isEmailConfiguredAsync() {
  if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) return true;
  const key = await resolveResendApiKey();
  return Boolean(key);
}

function isEmailConfigured() {
  // Sync check used by routes; true if env set OR we already cached a Supabase-backed key.
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST || secretCache.resendKey);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function reportPublicUrl(slug) {
  return `${API_PUBLIC}/v1/research/reports/${encodeURIComponent(slug)}/html`;
}

function labUrl() {
  return `${SITE.replace(/\/$/, '')}/research-lab`;
}

function appendResearchSubscriber(email, slug, topic) {
  const file = path.join(__dirname, '..', '..', 'data', 'research-subscribers.json');
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let list = [];
  if (fs.existsSync(file)) {
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }
  list.push({
    email: String(email).trim().toLowerCase(),
    slug,
    topic,
    at: new Date().toISOString(),
  });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

function buildReportReadyEmail({ email, topic, slug, audience, fromAddress }) {
  const url = reportPublicUrl(slug);
  const html = buildBrandedEmailHtml({
    preheader: `Your DividendFlow research report is ready: ${topic}`,
    headline: 'Your market research report is ready',
    bodyHtml: `<p>Hi,</p>
      <p>Your <strong>Market Research Agent</strong> report is ready.</p>
      <p style="margin:16px 0;padding:12px 14px;background:${BRAND.iceLight};border-radius:12px;font-size:14px">
        <strong>Topic:</strong> ${escapeHtml(topic)}<br/>
        <strong>Audience:</strong> ${escapeHtml(audience || 'market_researcher')}<br/>
        <strong>Report id:</strong> ${escapeHtml(slug)}
      </p>
      <p>Open the full HTML report (charts + citations + PSX stock join) with the button below. You can also start another brief anytime in Research Lab.</p>`,
    ctaUrl: url,
    ctaLabel: 'Open my research report',
    footerNote: `Sent to ${email}. Research Lab: ${labUrl()}. Educational only — not investment advice. Support: ${process.env.SUPPORT_EMAIL || 'adminsupport@dividendflow.pk'}`,
  });
  return {
    subject: `Your DividendFlow research report — ${topic}`.slice(0, 110),
    html,
    text: `Your research report is ready.\nTopic: ${topic}\nOpen: ${url}\nLab: ${labUrl()}`,
    url,
    from: fromAddress || defaultFrom(),
  };
}

async function sendViaResend({ apiKey, from, to, subject, html, text }) {
  if (!apiKey) return false;
  await axios.post(
    'https://api.resend.com/emails',
    {
      from: from || defaultFrom(),
      to: [to],
      subject,
      html,
      text,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    }
  );
  return true;
}

async function sendViaSmtp({ to, subject, html, text, from }) {
  if (!process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transporter.sendMail({ from: from || defaultFrom(), to, subject, html, text });
  return true;
}

/** Fallback when Render lacks RESEND_API_KEY but Supabase Edge has it. */
async function sendViaSupabaseEdge({ to, subject, html, text, from }) {
  const url = supabaseEmailUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const { data } = await axios.post(
    url,
    { to, subject, html, text, from: from || defaultFrom() },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    }
  );
  if (!data?.ok) {
    throw new Error(data?.error || 'supabase send-app-email failed');
  }
  return true;
}

async function sendResearchReportEmail({ email, topic, slug, audience }) {
  const to = String(email || '').trim().toLowerCase();
  if (!isValidEmail(to)) return { ok: false, channel: 'none', error: 'invalid email' };
  if (!slug) return { ok: false, channel: 'none', error: 'missing slug' };

  const apiKey = await resolveResendApiKey();
  const fromAddress = defaultFrom();
  const built = buildReportReadyEmail({ email: to, topic, slug, audience, fromAddress });
  try {
    appendResearchSubscriber(to, slug, topic);
  } catch (err) {
    console.warn('[researchMail] subscriber log failed', err.message);
  }

  try {
    if (apiKey) {
      await sendViaResend({
        apiKey,
        from: fromAddress,
        to,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
      return { ok: true, channel: 'resend', url: built.url };
    }
    if (process.env.SMTP_HOST) {
      await sendViaSmtp({
        to,
        subject: built.subject,
        html: built.html,
        text: built.text,
        from: fromAddress,
      });
      return { ok: true, channel: 'smtp', url: built.url };
    }
    if (supabaseEmailUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await sendViaSupabaseEdge({
        to,
        subject: built.subject,
        html: built.html,
        text: built.text,
        from: fromAddress,
      });
      return { ok: true, channel: 'supabase-edge', url: built.url };
    }
    console.warn('[researchMail] No RESEND_API_KEY (env or private.app_secrets), SMTP, or edge mail');
    return { ok: false, channel: 'none', error: 'email not configured', url: built.url };
  } catch (err) {
    console.error('[researchMail] send failed', err.message);
    return { ok: false, channel: 'error', error: err.message, url: built.url };
  }
}

module.exports = {
  isEmailConfigured,
  isEmailConfiguredAsync,
  resolveResendApiKey,
  isValidEmail,
  reportPublicUrl,
  labUrl,
  sendResearchReportEmail,
  buildReportReadyEmail,
};

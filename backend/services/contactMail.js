const axios = require('axios');
const nodemailer = require('nodemailer');
const { BRAND, buildBrandedEmailHtml, escapeHtml } = require('./emailBrand');

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'adminsupport@dividendflow.pk';
const CONTACT_FROM = process.env.CONTACT_EMAIL_FROM || 'DividendFlow PK <noreply@dividendflow.pk>';
const CONTACT_TO = process.env.CONTACT_EMAIL_TO || 'ammarjamshed123@gmail.com';

function buildContactHtml({ name, email, subject, message }) {
  const when = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  return buildBrandedEmailHtml({
    preheader: `New contact form message from ${name}`,
    headline: 'New contact form message',
    bodyHtml: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject || 'General inquiry')}</p>
      <p><strong>Received:</strong> ${escapeHtml(when)} (PKT)</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0" />
      <p style="white-space:pre-wrap;line-height:1.5">${escapeHtml(message)}</p>`,
    footerNote: `Reply directly to this email to reach the sender. Support: ${SUPPORT_EMAIL}`,
  });
}

async function sendViaResend({ name, email, subject, message, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  await axios.post(
    'https://api.resend.com/emails',
    {
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: email,
      subject: `[DividendFlow] ${subject || 'Contact form'} — ${name}`,
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );
  return true;
}

async function sendViaSmtp({ name, email, subject, message, html }) {
  if (!process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transporter.sendMail({
    from: CONTACT_FROM,
    to: CONTACT_TO,
    replyTo: `${name} <${email}>`,
    subject: `[DividendFlow] ${subject || 'Contact form'} — ${name}`,
    html,
    text: `From: ${name} <${email}>\n\n${message}`,
  });
  return true;
}

async function sendContactMessage({ name, email, subject, message }) {
  const html = buildContactHtml({ name, email, subject, message });
  const payload = { name, email, subject, message, html };

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(payload);
    return { ok: true, channel: 'resend' };
  }
  if (process.env.SMTP_HOST) {
    await sendViaSmtp(payload);
    return { ok: true, channel: 'smtp' };
  }

  console.warn('[contactMail] No RESEND_API_KEY or SMTP_HOST — contact email not sent');
  return { ok: false, channel: 'none' };
}

function isContactConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

module.exports = {
  SUPPORT_EMAIL,
  CONTACT_FROM,
  CONTACT_TO,
  sendContactMessage,
  isContactConfigured,
};

#!/usr/bin/env node
/**
 * Send scraper result email via SMTP or Resend
 * SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SCRAPER_EMAIL_TO
 * Resend: RESEND_API_KEY, SCRAPER_EMAIL_TO
 */
import axios from 'axios';
import nodemailer from 'nodemailer';

export async function sendScraperEmail({ success, changes, error }) {
  const to = process.env.SCRAPER_EMAIL_TO;
  if (!to) return;

  const date = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const subject = success
    ? `DividendFlow PK: Scraper completed – ${changes.summary}`
    : `DividendFlow PK: Scraper failed – ${error}`;

  const html = buildEmailHtml(success, changes, error, date);

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, html);
  } else if (process.env.SMTP_HOST) {
    await sendViaSmtp(to, subject, html);
  } else {
    console.log('[Email] No RESEND_API_KEY or SMTP config – skipping');
  }
}

function buildEmailHtml(success, changes, error, date) {
  if (success) {
    let body = `<p><strong>Scraper ran successfully</strong> at ${date} (4pm PKT).</p>`;
    body += `<p><strong>Summary:</strong> ${changes.summary}</p>`;
    if (changes.priceChanges?.length) {
      body += `<h3>Price changes</h3><ul>`;
      changes.priceChanges.slice(0, 20).forEach(c => {
        body += `<li><strong>${c.company}</strong>: Rs ${c.old} → Rs ${c.new}</li>`;
      });
      if (changes.priceChanges.length > 20) body += `<li>... and ${changes.priceChanges.length - 20} more</li>`;
      body += `</ul>`;
    }
    if (changes.dividendChanges?.length) {
      body += `<h3>Dividend policy changes</h3><ul>`;
      changes.dividendChanges.slice(0, 20).forEach(c => {
        body += `<li><strong>${c.company}</strong>: ${c.detail}</li>`;
      });
      if (changes.dividendChanges.length > 20) body += `<li>... and ${changes.dividendChanges.length - 20} more</li>`;
      body += `</ul>`;
    }
    if (changes.newCompanies?.length) {
      body += `<h3>New companies added</h3><p>${changes.newCompanies.join(', ')}</p>`;
    }
    if (!changes.priceChanges?.length && !changes.dividendChanges?.length && !changes.newCompanies?.length) {
      body += `<p>No changes detected. Data is up to date.</p>`;
    }
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px">${body}<hr><p style="color:#888;font-size:12px">DividendFlow PK – PSX Dividend Intelligence</p></body></html>`;
  } else {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px"><p><strong>Scraper failed</strong> at ${date}.</p><p>Error: ${error}</p><hr><p style="color:#888;font-size:12px">DividendFlow PK</p></body></html>`;
  }
}

async function sendViaResend(to, subject, html) {
  const from = process.env.SCRAPER_EMAIL_FROM || 'DividendFlow <onboarding@resend.dev>';
  await axios.post('https://api.resend.com/emails', {
    from,
    to: [to],
    subject,
    html,
  }, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  console.log('[Email] Sent via Resend to', to);
}

async function sendViaSmtp(to, subject, html) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const from = process.env.SCRAPER_EMAIL_FROM || process.env.SMTP_USER || 'noreply@dividendflow.pk';
  await transporter.sendMail({ from, to, subject, html });
  console.log('[Email] Sent via SMTP to', to);
}

/** Shared branded HTML email layout for backend mail (contact, newsletters). */

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'adminsupport@dividendflow.pk';

const BRAND = {
  name: 'DividendFlow PK',
  from: process.env.AUTH_EMAIL_FROM || 'DividendFlow PK <noreply@dividendflow.pk>',
  logoUrl: 'https://dividendflow.pk/dividendflow-logo.png',
  siteUrl: 'https://dividendflow.pk',
  ink: '#0a0e14',
  inkSoft: '#141c28',
  ice: '#5eb8e8',
  iceLight: '#e5f2fa',
  muted: '#64748b',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBrandedEmailHtml({
  preheader,
  headline,
  bodyHtml,
  ctaUrl,
  ctaLabel,
  footerNote = 'You received this email from DividendFlow PK (dividendflow.pk).',
}) {
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto 8px"><tr><td style="border-radius:12px;background:${BRAND.ink}"><a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(ctaLabel)}</a></td></tr></table>`
      : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(headline)}</title></head><body style="margin:0;padding:0;background:#e8f0f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e8f0f6;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4ec;box-shadow:0 8px 30px rgba(10,14,20,0.08)"><tr><td style="background:linear-gradient(135deg,${BRAND.ink} 0%,${BRAND.inkSoft} 55%,#1a3a52 100%);padding:28px 32px;text-align:center"><img src="${BRAND.logoUrl}" width="56" height="56" alt="DividendFlow PK" style="display:block;margin:0 auto 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.15)" /><p style="margin:0;font-size:18px;font-weight:800;color:#ffffff">DividendFlow PK</p><p style="margin:6px 0 0;font-size:12px;color:${BRAND.iceLight};letter-spacing:0.08em;text-transform:uppercase">PSX dividend intelligence</p></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:800">${escapeHtml(headline)}</h1><div style="font-size:15px;line-height:1.7;color:#334155">${bodyHtml}</div>${ctaBlock}</td></tr><tr><td style="padding:0 32px 28px"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px" /><p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(footerNote)}</p></td></tr></table></td></tr></table></body></html>`;
}

function buildSignupConfirmationEmail(email, confirmUrl) {
  return {
    subject: 'Confirm your DividendFlow PK account',
    html: buildBrandedEmailHtml({
      preheader: 'Confirm your email to unlock PSX dividend tools.',
      headline: 'Welcome — confirm your email',
      bodyHtml: `<p>Thanks for joining <strong>DividendFlow PK</strong>. Confirm your email to access PSX tools.</p><p style="margin-top:16px;padding:12px 14px;background:${BRAND.iceLight};border-radius:12px;font-size:14px"><strong>Account:</strong> ${escapeHtml(email)}</p>`,
      ctaUrl: confirmUrl,
      ctaLabel: 'Confirm email address',
    }),
  };
}

module.exports = {
  BRAND,
  SUPPORT_EMAIL,
  escapeHtml,
  buildBrandedEmailHtml,
  buildSignupConfirmationEmail,
};

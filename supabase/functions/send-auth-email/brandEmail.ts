export const SUPPORT_EMAIL = 'adminsupport@dividendflow.pk';

export const BRAND = {
  name: 'DividendFlow PK',
  from: 'DividendFlow PK <noreply@dividendflow.pk>',
  logoUrl: 'https://dividendflow.pk/dividendflow-logo.png',
  siteUrl: 'https://dividendflow.pk',
  ink: '#0a0e14',
  inkSoft: '#141c28',
  ice: '#5eb8e8',
  iceLight: '#e5f2fa',
  muted: '#64748b',
};

export const AUTH_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your DividendFlow PK account',
  recovery: 'Reset your DividendFlow PK password',
  magiclink: 'Sign in to DividendFlow PK',
  invite: "You're invited to DividendFlow PK",
  email: 'Confirm your DividendFlow PK email',
  email_change: 'Confirm your new DividendFlow PK email',
  reauthentication: 'Your DividendFlow PK verification code',
};

type BrandedEmailOptions = {
  preheader: string;
  headline: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerNote?: string;
};

export function buildBrandedEmailHtml({
  preheader,
  headline,
  bodyHtml,
  ctaUrl,
  ctaLabel,
  footerNote = 'You received this email because you use DividendFlow PK (dividendflow.pk).',
}: BrandedEmailOptions): string {
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto 8px">
          <tr>
            <td style="border-radius:12px;background:${BRAND.ink}">
              <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${ctaLabel}</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};word-break:break-all">Or copy this link:<br><a href="${ctaUrl}" style="color:${BRAND.ice}">${ctaUrl}</a></p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#e8f0f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e8f0f6;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4ec;box-shadow:0 8px 30px rgba(10,14,20,0.08)">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.ink} 0%,${BRAND.inkSoft} 55%,#1a3a52 100%);padding:28px 32px;text-align:center">
              <img src="${BRAND.logoUrl}" width="56" height="56" alt="DividendFlow PK" style="display:block;margin:0 auto 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.15)" />
              <p style="margin:0;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">DividendFlow PK</p>
              <p style="margin:6px 0 0;font-size:12px;color:${BRAND.iceLight};letter-spacing:0.08em;text-transform:uppercase">PSX dividend intelligence</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:800;color:${BRAND.ink}">${headline}</h1>
              <div style="font-size:15px;line-height:1.7;color:#334155">${bodyHtml}</div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px" />
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">${footerNote}</p>
              <p style="margin:12px 0 0;font-size:12px;color:${BRAND.muted}">© ${new Date().getFullYear()} DividendFlow PK · <a href="${BRAND.siteUrl}" style="color:${BRAND.ice};text-decoration:none">dividendflow.pk</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildSignupConfirmationEmail(email: string, confirmUrl: string) {
  return {
    subject: AUTH_SUBJECTS.signup,
    html: buildBrandedEmailHtml({
      preheader: 'Confirm your email to unlock PSX dividend tools.',
      headline: 'Welcome - confirm your email',
      bodyHtml: `<p>Thanks for joining <strong>DividendFlow PK</strong>. Confirm your email address to access the dividend calendar, market data, forecasts, and other PSX research tools.</p>
        <p style="margin-top:16px;padding:12px 14px;background:${BRAND.iceLight};border-radius:12px;font-size:14px;color:#334155"><strong>Account:</strong> ${email}</p>
        <p style="margin-top:16px;font-size:14px;color:${BRAND.muted}">This link expires soon. If you did not sign up, you can safely ignore this message.</p>`,
      ctaUrl: confirmUrl,
      ctaLabel: 'Confirm email address',
      footerNote: `DividendFlow PK sends account emails from noreply@dividendflow.pk. For help, email ${SUPPORT_EMAIL}.`,
    }),
  };
}

export function buildAuthEmail(
  actionType: string,
  email: string,
  confirmUrl: string,
  token?: string
) {
  switch (actionType) {
    case 'signup':
    case 'email':
      return buildSignupConfirmationEmail(email, confirmUrl);
    case 'recovery':
      return {
        subject: AUTH_SUBJECTS.recovery,
        html: buildBrandedEmailHtml({
          preheader: 'Reset your DividendFlow PK password.',
          headline: 'Reset your password',
          bodyHtml: `<p>We received a request to reset the password for <strong>${email}</strong>.</p>`,
          ctaUrl: confirmUrl,
          ctaLabel: 'Reset password',
          footerNote: 'If you did not request a password reset, ignore this email.',
        }),
      };
    case 'magiclink':
      return {
        subject: AUTH_SUBJECTS.magiclink,
        html: buildBrandedEmailHtml({
          preheader: 'Your one-time sign-in link for DividendFlow PK.',
          headline: 'Sign in to DividendFlow PK',
          bodyHtml: `<p>Use the button below to sign in to <strong>${email}</strong>. This link works once and expires shortly.</p>`,
          ctaUrl: confirmUrl,
          ctaLabel: 'Sign in',
        }),
      };
    case 'invite':
      return {
        subject: AUTH_SUBJECTS.invite,
        html: buildBrandedEmailHtml({
          preheader: 'You have been invited to DividendFlow PK.',
          headline: "You're invited",
          bodyHtml: `<p>You have been invited to create a DividendFlow PK account for PSX dividend research.</p>`,
          ctaUrl: confirmUrl,
          ctaLabel: 'Accept invitation',
        }),
      };
    case 'email_change':
      return {
        subject: AUTH_SUBJECTS.email_change,
        html: buildBrandedEmailHtml({
          preheader: 'Confirm your new DividendFlow PK email address.',
          headline: 'Confirm email change',
          bodyHtml: `<p>Confirm this email change for your DividendFlow PK account.</p>`,
          ctaUrl: confirmUrl,
          ctaLabel: 'Confirm new email',
        }),
      };
    case 'reauthentication':
      return {
        subject: AUTH_SUBJECTS.reauthentication,
        html: buildBrandedEmailHtml({
          preheader: 'Your DividendFlow PK verification code.',
          headline: 'Verification code',
          bodyHtml: `<p>Enter this code to continue:</p><p style="font-size:28px;font-weight:800;letter-spacing:0.2em;color:${BRAND.ink}">${token || ''}</p>`,
        }),
      };
    default:
      return buildSignupConfirmationEmail(email, confirmUrl);
  }
}

export function generateConfirmationURL(
  projectRef: string,
  emailData: {
    token_hash: string;
    email_action_type: string;
    redirect_to: string;
  }
) {
  const redirectTo = normalizeRedirectTo(emailData.redirect_to);
  const baseUrl = `https://${projectRef}.supabase.co/auth/v1/verify`;
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: redirectTo,
  });
  return `${baseUrl}?${params.toString()}`;
}

const PRODUCTION_CALLBACK = `${BRAND.siteUrl}/auth/callback`;

export function normalizeRedirectTo(redirectTo: string) {
  let next: string | null = null;
  if (redirectTo) {
    try {
      next = new URL(redirectTo).searchParams.get('next');
    } catch {
      // ignore malformed redirect URLs from Supabase
    }
  }
  if (!next) return PRODUCTION_CALLBACK;
  return `${PRODUCTION_CALLBACK}?next=${encodeURIComponent(next)}`;
}

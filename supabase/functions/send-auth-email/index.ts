import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import {
  BRAND,
  SUPPORT_EMAIL,
  buildAuthEmail,
  generateConfirmationURL,
} from './brandEmail.ts';

const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF') || 'dbkytlsejpxmclpznudk';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const hookSecretRaw = Deno.env.get('SEND_EMAIL_HOOK_SECRET') || '';

function hookSecret() {
  return hookSecretRaw.replace(/^v1,whsec_/, '');
}

async function sendViaResend(to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: BRAND.from, to: [to], subject, html, reply_to: SUPPORT_EMAIL }),
  });
  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!RESEND_API_KEY || !hookSecretRaw) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500 });
  }
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  try {
    const wh = new Webhook(hookSecret());
    const { user, email_data } = wh.verify(payload, headers) as {
      user: { email: string };
      email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string };
    };
    const confirmUrl = generateConfirmationURL(PROJECT_REF, email_data);
    const { subject, html } = buildAuthEmail(email_data.email_action_type, user.email, confirmUrl, email_data.token);
    await sendViaResend(user.email, subject, html);
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email hook error';
    return new Response(JSON.stringify({ error: { message } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
});

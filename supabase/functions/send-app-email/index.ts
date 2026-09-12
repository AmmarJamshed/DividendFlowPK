/**
 * Transactional app email (Research Lab reports, etc.) via Resend.
 * Call with Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> (verify_jwt=true).
 */
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM =
  Deno.env.get('RESEND_FROM') ||
  Deno.env.get('AUTH_EMAIL_FROM') ||
  Deno.env.get('CONTACT_EMAIL_FROM') ||
  'DividendFlow PK <noreply@dividendflow.pk>';
const SUPPORT = Deno.env.get('SUPPORT_EMAIL') || 'adminsupport@dividendflow.pk';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured on Edge Function secrets' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { to?: string; subject?: string; html?: string; text?: string; from?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const to = String(body.to || '').trim().toLowerCase();
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '');
  const text = String(body.text || '');
  if (!to || !subject || !html) {
    return new Response(JSON.stringify({ error: 'to, subject, and html are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: body.from || FROM,
      to: [to],
      subject,
      html,
      text: text || undefined,
      reply_to: SUPPORT,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return new Response(JSON.stringify({ error: `Resend ${response.status}`, detail }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify({ ok: true, id: data.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

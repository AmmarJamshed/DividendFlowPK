#!/usr/bin/env node
/**
 * Pin Supabase Auth URLs to production (fixes localhost confirmation links).
 *
 * Requires SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/fix-supabase-auth-urls.mjs
 */
const projectRef = process.env.SUPABASE_PROJECT_REF || 'dbkytlsejpxmclpznudk';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const siteUrl = 'https://dividendflow.pk';
const redirectUrls = [
  'https://dividendflow.pk/auth/callback',
  'https://dividendflow.pk/**',
  'http://localhost:3000/auth/callback',
].join(',');

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  console.error('Create one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const getRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, { headers });
const before = await getRes.json();
if (!getRes.ok) {
  console.error('Could not read auth config:', getRes.status, before);
  process.exit(1);
}

console.log('Before:', { site_url: before.site_url, uri_allow_list: before.uri_allow_list });

const patchRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    site_url: siteUrl,
    uri_allow_list: redirectUrls,
  }),
});

const after = await patchRes.json();
if (!patchRes.ok) {
  console.error('Update failed:', patchRes.status, after);
  process.exit(1);
}

console.log('After:', { site_url: after.site_url, uri_allow_list: after.uri_allow_list });
console.log('Done. Ask affected users to resend confirmation email from Sign in page.');

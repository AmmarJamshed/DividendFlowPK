#!/usr/bin/env node
/**
 * Deploy send-auth-email Edge Function to Supabase.
 * Requires: SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/deploy-auth-email.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectRef = process.env.SUPABASE_PROJECT_REF || 'dbkytlsejpxmclpznudk';
const token = process.env.SUPABASE_ACCESS_TOKEN;

const fnDir = path.join(root, 'supabase/functions/send-auth-email');
const files = ['index.ts', 'brandEmail.ts'].map((name) => ({
  name,
  content: fs.readFileSync(path.join(fnDir, name), 'utf8'),
}));

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens');
  console.error('Then run: node scripts/deploy-auth-email.mjs');
  process.exit(1);
}

const body = {
  name: 'send-auth-email',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files,
};

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=send-auth-email`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('Deploy failed:', res.status, text);
  process.exit(1);
}

console.log('Deployed send-auth-email:', text);

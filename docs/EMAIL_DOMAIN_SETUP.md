# Email domain setup — dividendflow.pk

Use **Resend** to send from your domain. You only verify the domain once; after that you can send as any address `@dividendflow.pk` (including `noreply@` and `adminsupport@`).

| Address | Purpose |
|---------|---------|
| `noreply@dividendflow.pk` | Signup confirmation, password reset, newsletters, scraper alerts (no replies expected) |
| `adminsupport@dividendflow.pk` | Public support email on the site; users can reply here for help |

---

## Part 1 — Send email (Resend)

### 1. Create Resend account and API key

1. Sign up at [resend.com](https://resend.com).
2. **API Keys** → Create API key → copy it (`re_...`).
3. Add the same key in:
   - **Render** → `dividendflow-backend` → `RESEND_API_KEY`
   - **Render** → cron services that send mail → `RESEND_API_KEY`
   - **Supabase** → Edge Functions → Secrets → `RESEND_API_KEY`

### 2. Add domain in Resend

1. [Resend → Domains](https://resend.com/domains) → **Add domain**
2. Enter: `dividendflow.pk`
3. Resend shows DNS records (SPF, DKIM, and optionally DMARC). Copy each one.

### 3. Add DNS records at your registrar

Add the records Resend gives you wherever `dividendflow.pk` DNS is managed (Cloudflare, Namecheap, GoDaddy, etc.).

Typical records (yours may differ — always use values from the Resend dashboard):

| Type | Name / Host | Value | Notes |
|------|-------------|-------|-------|
| TXT | `@` or `dividendflow.pk` | `v=spf1 include:amazonses.com ~all` | SPF (Resend shows exact value) |
| TXT | `resend._domainkey` | long DKIM string | DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:adminsupport@dividendflow.pk` | Optional but recommended |

**Cloudflare tip:** set proxy status to **DNS only** (grey cloud) for mail-related TXT/MX records if verification fails.

### 4. Verify domain

1. In Resend → Domains → **Verify DNS records**
2. Status should become **Verified** (usually a few minutes, up to 72 hours)

### 5. Test sending

After verification, send a test from [Resend → Emails → Send](https://resend.com/emails):

- **From:** `DividendFlow PK <noreply@dividendflow.pk>`
- **To:** your personal inbox

Repeat with `adminsupport@dividendflow.pk` as From — both work on one verified domain.

### 6. Wire Supabase auth emails

1. Supabase → **Edge Functions → Secrets:**
   - `RESEND_API_KEY`
   - `SEND_EMAIL_HOOK_SECRET` (from Authentication → Hooks → Send Email)
2. **Authentication → Hooks → Send Email** → HTTPS:
   ```
   https://dbkytlsejpxmclpznudk.supabase.co/functions/v1/send-auth-email
   ```
3. **Authentication → URL Configuration:**
   - Site URL: `https://dividendflow.pk`
   - Redirect URLs: `https://dividendflow.pk/auth/callback`

Signup confirmations then go out as **DividendFlow PK &lt;noreply@dividendflow.pk&gt;** with your branded template.

---

## Part 2 — Receive email at adminsupport@

Resend is for **sending**. To **read** mail sent to `adminsupport@dividendflow.pk`, pick one option:

### Option A — Cloudflare Email Routing (free, recommended)

If DNS is on Cloudflare:

1. **Email → Email Routing** → enable for `dividendflow.pk`
2. Add destination address (e.g. your Gmail) and verify it
3. Create rule: `adminsupport@dividendflow.pk` → forward to your Gmail
4. Optional: catch-all `*@dividendflow.pk` → same inbox

No MX conflict with Resend sending records.

### Option B — Registrar / cPanel forward

Many registrars offer free forwarding:

- `adminsupport@dividendflow.pk` → `you@gmail.com`

Use this if you are not on Cloudflare.

### Option C — Resend inbound (advanced)

Resend can receive mail if you add their **MX** record. Only use this if `dividendflow.pk` has **no other inbox** (no Google Workspace, etc.), or use a subdomain like `mail.dividendflow.pk`.

Requires a webhook in your backend for `email.received` events. See [Resend receiving docs](https://resend.com/docs/dashboard/receiving/custom-domains).

### Option D — Google Workspace / Microsoft 365

Create a real mailbox `adminsupport@dividendflow.pk` (~$6/mo). Best if you want a full inbox, calendar, and team access.

---

## Part 3 — App environment variables

Set on **Render → dividendflow-backend**:

| Variable | Example value |
|----------|----------------|
| `RESEND_API_KEY` | `re_...` |
| `AUTH_EMAIL_FROM` | `DividendFlow PK <noreply@dividendflow.pk>` |
| `CONTACT_EMAIL_FROM` | `DividendFlow PK <noreply@dividendflow.pk>` |
| `CONTACT_EMAIL_TO` | `ammarjamshed123@gmail.com` (until forwarding works, then `adminsupport@dividendflow.pk`) |
| `SUPPORT_EMAIL` | `adminsupport@dividendflow.pk` |

For cron/scraper services:

| Variable | Example value |
|----------|----------------|
| `SCRAPER_EMAIL_FROM` | `DividendFlow PK <noreply@dividendflow.pk>` |
| `SCRAPER_EMAIL_TO` | your inbox |

---

## Part 4 — DMARC (after a week of sending)

Once mail is flowing, tighten DMARC:

```
v=DMARC1; p=quarantine; pct=100; rua=mailto:adminsupport@dividendflow.pk
```

Start with `p=none` while testing, then move to `quarantine` or `reject`.

---

## Checklist

- [ ] Domain `dividendflow.pk` verified in Resend (SPF + DKIM green)
- [ ] Test send from `noreply@dividendflow.pk` succeeds
- [ ] Test send from `adminsupport@dividendflow.pk` succeeds
- [ ] `RESEND_API_KEY` on Render backend + Supabase Edge Function secrets
- [ ] Supabase Send Email hook enabled
- [ ] Forwarding or inbox for `adminsupport@dividendflow.pk` configured
- [ ] Sign up with a new email and confirm branded message arrives

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Emails go to spam | Complete DKIM/SPF/DMARC; warm up with low volume first |
| “Domain not verified” in Resend | Re-check TXT records; disable Cloudflare proxy on mail records |
| Auth emails still generic Supabase | Enable Send Email hook + set secrets |
| Contact form not sending | Set `RESEND_API_KEY` on backend; check Render logs |
| Cannot receive at adminsupport@ | Set up Cloudflare Email Routing or registrar forward (Part 2) |

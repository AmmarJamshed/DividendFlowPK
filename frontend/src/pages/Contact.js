import { useState } from 'react';
import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '../components/legal/LegalPageLayout';
import { usePageTitle } from '../hooks/usePageTitle';
import { api } from '../api';
import { OFFICIAL_CONTACT_EMAIL } from '../config/contact';

export default function Contact() {
  usePageTitle('Contact — DividendFlow PK');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    try {
      const { data } = await api.postContact(form);
      if (data.ok) {
        setStatus('sent');
        setForm({ name: '', email: '', subject: '', message: '' });
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Could not send your message. Try again later.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        err.response?.data?.error ||
          'Could not reach the server. Email us directly if this keeps happening.'
      );
    }
  };

  return (
    <LegalPageLayout
      eyebrow="Contact"
      title="Contact us"
      description="Send a message to the official DividendFlow PK channel. We route inquiries from contact@dividendflow.pk."
    >
      <LegalSection title="Official channel">
        <p>
          <strong>Email:</strong>{' '}
          <span className="text-ice-700 font-semibold">{OFFICIAL_CONTACT_EMAIL}</span>
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Use the form below — messages are delivered to our team from the official DividendFlow contact
          address. We aim to respond within 3–5 business days. We cannot provide personalised investment
          advice.
        </p>
      </LegalSection>

      <LegalSection title="Send a message">
        {status === 'sent' ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Thank you — your message was sent via {OFFICIAL_CONTACT_EMAIL}. We will reply to the email
            address you provided.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Your name</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-ice-400/50 focus:border-ice-300"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Your email</span>
                <input
                  type="email"
                  required
                  maxLength={200}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-ice-400/50 focus:border-ice-300"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Subject (optional)</span>
              <input
                type="text"
                maxLength={200}
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Data correction, privacy request, partnership…"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-ice-400/50 focus:border-ice-300"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Message</span>
              <textarea
                required
                rows={5}
                maxLength={4000}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-ice-400/50 focus:border-ice-300 resize-y"
              />
            </label>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />
            {status === 'error' && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-ink hover:bg-ink disabled:opacity-60 border border-ink"
            >
              {status === 'sending' ? 'Sending…' : `Send via ${OFFICIAL_CONTACT_EMAIL}`}
            </button>
          </form>
        )}
      </LegalSection>

      <LegalSection title="What to contact us about">
        <ul className="list-disc pl-5 space-y-1">
          <li>Data corrections (wrong dividend date, symbol, or price)</li>
          <li>Privacy requests (access, correction, or deletion)</li>
          <li>Bug reports or accessibility issues</li>
          <li>Press, partnerships, or licensing questions</li>
        </ul>
      </LegalSection>

      <LegalSection title="Before you write">
        <p>
          Market data is updated on a schedule after each session — not a live trading terminal. For
          urgent trading decisions, contact your broker or the relevant exchange.
        </p>
        <p>
          Privacy questions: <Link to="/privacy" className="text-ice-700 hover:underline">Privacy Policy</Link>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}

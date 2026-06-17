import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '../components/legal/LegalPageLayout';
import { usePageTitle } from '../hooks/usePageTitle';

export default function Contact() {
  usePageTitle('Contact — DividendFlow PK');
  return (
    <LegalPageLayout
      eyebrow="Contact"
      title="Contact us"
      description="Reach the DividendFlow PK team for support, corrections, privacy requests, or partnership inquiries."
    >
      <LegalSection title="Email">
        <p>
          <strong>General &amp; support:</strong>{' '}
          <a href="mailto:contact@dividendflow.pk" className="text-teal-700 font-semibold hover:underline">
            contact@dividendflow.pk
          </a>
        </p>
        <p className="text-slate-500 text-xs mt-2">
          We aim to respond within 3–5 business days. We cannot provide personalised investment advice by email.
        </p>
      </LegalSection>

      <LegalSection title="What to contact us about">
        <ul className="list-disc pl-5 space-y-1">
          <li>Data corrections (wrong dividend date, symbol, or price in our tables)</li>
          <li>Privacy requests (access, correction, or deletion)</li>
          <li>Bug reports or accessibility issues</li>
          <li>Press, partnerships, or licensing questions</li>
          <li>AdSense / advertising inquiries (publishers only)</li>
        </ul>
      </LegalSection>

      <LegalSection title="Before you write">
        <p>
          Market data on DividendFlow PK is updated on a schedule after each session — it is not a live trading
          terminal. For urgent trading decisions, contact your broker or the relevant exchange directly.
        </p>
        <p>
          For privacy-specific questions, see our{' '}
          <Link to="/privacy" className="text-teal-700 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Website">
        <p>
          <a href="https://dividendflow.pk" className="text-teal-700 hover:underline">
            https://dividendflow.pk
          </a>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}

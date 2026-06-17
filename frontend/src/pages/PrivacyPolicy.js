import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '../components/legal/LegalPageLayout';
import { usePageTitle } from '../hooks/usePageTitle';

const UPDATED = '14 June 2026';

export default function PrivacyPolicy() {
  usePageTitle('Privacy Policy — DividendFlow PK');
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      description="How DividendFlow PK collects, uses, and protects information when you use our website and tools."
      updated={UPDATED}
    >
      <LegalSection title="1. Who we are">
        <p>
          DividendFlow PK (&quot;we&quot;, &quot;us&quot;) operates{' '}
          <a href="https://dividendflow.pk" className="text-teal-700 hover:underline">dividendflow.pk</a>
          , a research and education platform for dividend and market data (primarily Pakistan Stock Exchange and
          selected global exchanges). We are not a broker, bank, or licensed investment adviser.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Usage analytics.</strong> We use Google Analytics (Google Tag: G-FMRQYTXT13) to understand how
          visitors use the site — for example pages viewed, approximate location (country/city), device type, and
          referral source. Google may set cookies or similar technologies. See{' '}
          <a
            href="https://policies.google.com/privacy"
            className="text-teal-700 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google&apos;s Privacy Policy
          </a>
          .
        </p>
        <p>
          <strong>Local preferences.</strong> Your selected exchange, cookie consent choice, AI assistant toggle, and
          similar settings may be stored in your browser (localStorage or sessionStorage).
        </p>
        <p>
          <strong>Watchlists and chat.</strong> If you use Market Buddy or watchlist features, messages and symbol
          lists you submit are sent to our servers to generate responses. We do not require account registration for
          basic use.
        </p>
        <p>
          <strong>Server logs.</strong> Our hosting provider may log IP address, user agent, and request timestamps for
          security and reliability.
        </p>
        <p>We do not knowingly sell your personal information to third parties.</p>
      </LegalSection>

      <LegalSection title="3. Cookies and similar technologies">
        <p>
          Cookies are small files stored on your device. We use:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Analytics cookies</strong> (Google Analytics) — to measure traffic and improve the product. You can
            decline non-essential cookies via our cookie banner or block cookies in your browser.
          </li>
          <li>
            <strong>Advertising cookies</strong> — if we display Google AdSense or similar ads in the future, Google and
            partners may use cookies to serve and measure ads. We will update this policy before enabling ads. See{' '}
            <a
              href="https://policies.google.com/technologies/ads"
              className="text-teal-700 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              How Google uses data in advertising
            </a>
            .
          </li>
        </ul>
        <p>
          You can control cookies through our site banner, your browser settings, or{' '}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            className="text-teal-700 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Analytics Opt-out
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="4. How we use information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Operate, maintain, and improve DividendFlow PK</li>
          <li>Display market data, calculators, and AI-assisted research tools</li>
          <li>Understand aggregate usage patterns (not to provide personalised investment advice)</li>
          <li>Protect against abuse and technical failures</li>
          <li>Comply with legal obligations</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Third-party services">
        <p>We rely on third parties that may process data under their own policies:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Google Analytics — website analytics</li>
          <li>Google AdSense (when enabled) — advertising</li>
          <li>Cloud hosting (e.g. Render) — application hosting</li>
          <li>Database providers (e.g. Supabase) — stored market and dividend data</li>
          <li>AI API providers — optional chat and commentary features</li>
          <li>Public data sources — PSX, exchange filings, and licensed/aggregated market feeds</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Data retention">
        <p>
          Analytics data is retained according to Google Analytics settings. Server logs are kept for a limited period
          for security. Market data in our database is retained to power historical charts and calendars. You may request
          deletion of correspondence sent to us at{' '}
          <a href="mailto:contact@dividendflow.pk" className="text-teal-700 hover:underline">
            contact@dividendflow.pk
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct, or delete personal data we hold about you,
          or to object to certain processing. Contact us at{' '}
          <a href="mailto:contact@dividendflow.pk" className="text-teal-700 hover:underline">
            contact@dividendflow.pk
          </a>
          . We will respond within a reasonable time.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>
          DividendFlow PK is intended for adults interested in market research. We do not knowingly collect data from
          children under 13 (or 16 where applicable). If you believe a child has provided information, contact us to
          request removal.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes">
        <p>
          We may update this Privacy Policy. The &quot;Last updated&quot; date at the top will change. Continued use of
          the site after changes constitutes acceptance of the updated policy.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Privacy questions:{' '}
          <a href="mailto:contact@dividendflow.pk" className="text-teal-700 hover:underline">
            contact@dividendflow.pk
          </a>
          {' '}· <Link to="/contact" className="text-teal-700 hover:underline">Contact page</Link>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}

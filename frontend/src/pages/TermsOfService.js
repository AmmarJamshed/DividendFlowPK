import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '../components/legal/LegalPageLayout';
import { usePageTitle } from '../hooks/usePageTitle';
import { OFFICIAL_CONTACT_EMAIL, OFFICIAL_CONTACT_LABEL } from '../config/contact';

const UPDATED = '14 June 2026';

export default function TermsOfService() {
  usePageTitle('Terms of Service — DividendFlow PK');
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Terms of Service"
      description="Rules for using DividendFlow PK. Please read before relying on any data or tools on this site."
      updated={UPDATED}
    >
      <LegalSection title="1. Agreement">
        <p>
          By accessing <a href="https://dividendflow.pk" className="text-ice-700 hover:underline">dividendflow.pk</a>
          , you agree to these Terms of Service and our{' '}
          <Link to="/privacy" className="text-ice-700 hover:underline">Privacy Policy</Link>. If you do not agree, do
          not use the site.
        </p>
      </LegalSection>

      <LegalSection title="2. What DividendFlow PK is">
        <p>
          DividendFlow PK provides <strong>educational and research tools</strong> — dividend calendars, closing prices,
          reporting cycles, calculators, and AI-assisted summaries — based on automated data collection and third-party
          feeds. We are <strong>not</strong> a broker, investment adviser, portfolio manager, or tax professional. Nothing
          on this site is an offer, solicitation, or recommendation to buy or sell any security.
        </p>
      </LegalSection>

      <LegalSection title="3. No investment advice">
        <p>
          All outputs — including charts, yields, forecasts, risk alerts, and Market Buddy chat replies — are for{' '}
          <strong>general information and learning only</strong>. They may be delayed, incomplete, or incorrect. You are
          solely responsible for your investment decisions. Consult a qualified adviser and verify figures with the
          relevant exchange, company announcements, and your broker before acting.
        </p>
      </LegalSection>

      <LegalSection title="4. Data accuracy">
        <p>
          We strive to keep PSX and global market data current through scheduled scrapes and database updates. We do{' '}
          <strong>not</strong> guarantee accuracy, completeness, timeliness, or fitness for any purpose. Data may reflect
          the last saved session, not live intraday prices. Dividend amounts, dates, and yields are indicative until
          confirmed from official sources.
        </p>
      </LegalSection>

      <LegalSection title="5. AI features">
        <p>
          AI-generated text (Market Buddy, salary simulator suggestions, commentary) is produced automatically from
          available files and databases. It can contain errors and must not be treated as personalised advice. Do not
          rely on AI outputs for trading or tax decisions.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Scrape or overload our servers beyond normal browsing</li>
          <li>Attempt unauthorised access to systems or data</li>
          <li>Misrepresent DividendFlow PK or resell our data without permission</li>
          <li>Use the site for unlawful purposes</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Intellectual property">
        <p>
          The DividendFlow PK name, design, and original content are protected by applicable law. Market data may be
          subject to third-party rights. You may link to our pages with attribution; do not copy substantial portions
          for commercial redistribution without written consent.
        </p>
      </LegalSection>

      <LegalSection title="8. Disclaimer of warranties">
        <p>
          THE SITE AND ALL CONTENT ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
          KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, DIVIDENDFLOW PK AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, OR ANY LOSS OF PROFITS OR DATA, ARISING FROM YOUR USE OF THE
          SITE OR RELIANCE ON ITS CONTENT.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes and termination">
        <p>
          We may modify these Terms or discontinue features at any time. Material changes will be reflected by updating
          the date above. Continued use constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These Terms are governed by the laws of Pakistan, without regard to conflict-of-law rules. Disputes shall be
          subject to the courts of Pakistan, unless mandatory local consumer law requires otherwise.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          <a href={`mailto:${OFFICIAL_CONTACT_EMAIL}`} className="text-ice-700 hover:underline">
            {OFFICIAL_CONTACT_LABEL}
          </a>
          {' '}· <Link to="/contact" className="text-ice-700 hover:underline">Contact page</Link>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}

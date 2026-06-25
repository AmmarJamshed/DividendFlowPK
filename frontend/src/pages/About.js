import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '../components/legal/LegalPageLayout';
import { usePageTitle } from '../hooks/usePageTitle';

export default function About() {
  usePageTitle('About — DividendFlow PK');
  return (
    <LegalPageLayout
      eyebrow="About"
      title="About DividendFlow PK"
      description="Independent dividend and market intelligence for Pakistan — built for research, not trading signals."
    >
      <LegalSection title="Our mission">
        <p>
          DividendFlow PK helps investors and learners understand <strong>dividend income patterns</strong>, session
          price moves, and reporting cycles on the Pakistan Stock Exchange (PSX). We focus on
          calendars, data tables, and educational calculators — not buy/sell calls.
        </p>
      </LegalSection>

      <LegalSection title="What we offer">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/dividend-calendar" className="text-ice-700 hover:underline">Dividend calendar</Link> — payout
            months, indicated yields, and sector coverage
          </li>
          <li>
            <Link to="/market-closing-prices" className="text-ice-700 hover:underline">Market data</Link> — closing
            prices, session movers, and volume
          </li>
          <li>
            <Link to="/reporting-cycles" className="text-ice-700 hover:underline">Reporting cycles</Link> — when
            companies typically announce results
          </li>
          <li>
            <Link to="/forecast-engine" className="text-ice-700 hover:underline">Forecast tools</Link> and{' '}
            <Link to="/salary-simulator" className="text-ice-700 hover:underline">income planner</Link> — illustrative
            models only
          </li>
          <li>
            <strong>Market Buddy</strong> — AI research assistant grounded in our database (not personalised advice)
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Data sources">
        <p>
          PSX closing prices and dividend schedules are collected from automated workflows aligned with exchange
          sessions. News headlines may come from public RSS feeds and financial news APIs.
          All figures should be confirmed with official exchange and company disclosures.
        </p>
      </LegalSection>

      <LegalSection title="Who operates this site">
        <p>
          DividendFlow PK is operated as an independent financial data and education project focused on the Pakistani
          market. We are not affiliated with the Pakistan Stock Exchange, SECP, or any brokerage. For business or press
          inquiries, use our{' '}
          <Link to="/contact" className="text-ice-700 hover:underline">Contact</Link> page.
        </p>
      </LegalSection>

      <LegalSection title="Important notice">
        <p>
          DividendFlow PK is for <strong>research and education only</strong>. We do not provide investment, tax, or
          legal advice. See our <Link to="/terms" className="text-ice-700 hover:underline">Terms of Service</Link> and{' '}
          <Link to="/privacy" className="text-ice-700 hover:underline">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}

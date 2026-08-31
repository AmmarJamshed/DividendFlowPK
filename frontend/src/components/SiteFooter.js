import { Link } from 'react-router-dom';
import { OFFICIAL_CONTACT_EMAIL } from '../config/contact';

const legalLinks = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-10 pt-6 border-t border-slate-200 text-center sm:text-left">
      <nav
        className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-2 text-xs font-medium text-slate-600"
        aria-label="Legal and site information"
      >
        {legalLinks.map(({ to, label }) => (
          <Link key={to} to={to} className="hover:text-ice-700 hover:underline">
            {label}
          </Link>
        ))}
        <Link to="/contact" className="text-ice-700 hover:underline">
          {OFFICIAL_CONTACT_EMAIL}
        </Link>
      </nav>
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
        © {year} DividendFlow PK.
      </p>
      <p className="mt-2 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
        DividendFlow PK is an independent educational and analytical platform. All data, including stock summaries,
        dividend yields, and Shariah-compliance tracking, are sourced from publicly available information for
        educational purposes only. We are not SECP-registered investment advisors, and our content does not constitute
        financial advice, buy/sell recommendations, or investment solicitation. Please consult a licensed professional
        broker before trading.
      </p>
    </footer>
  );
}

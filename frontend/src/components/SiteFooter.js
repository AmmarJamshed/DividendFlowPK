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
          <Link key={to} to={to} className="hover:text-teal-700 hover:underline">
            {label}
          </Link>
        ))}
        <Link to="/contact" className="text-teal-700 hover:underline">
          {OFFICIAL_CONTACT_EMAIL}
        </Link>
      </nav>
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
        © {year} DividendFlow PK. For research and education only — not investment, tax, or legal advice. Confirm all
        figures with the relevant exchange and your broker.
      </p>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import PageHero from '../ui/PageHero';

export function LegalSection({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-900 mb-3">{title}</h2>
      <div className="prose-legal text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function LegalPageLayout({ eyebrow, title, description, children, updated }) {
  return (
    <div className="space-y-6 pb-8">
      <PageHero eyebrow={eyebrow} title={title} description={description} />
      <article className="rounded-2xl bg-white/90 border border-slate-200 shadow-sm p-6 sm:p-8">
        {updated && (
          <p className="text-xs text-slate-500 mb-6 pb-4 border-b border-slate-100">
            Last updated: {updated}
          </p>
        )}
        {children}
        <p className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-500">
          Questions? See our <Link to="/contact" className="text-teal-700 font-medium hover:underline">Contact</Link> page
          {' '}or <Link to="/about" className="text-teal-700 font-medium hover:underline">About</Link> page for more on DividendFlow PK.
        </p>
      </article>
    </div>
  );
}

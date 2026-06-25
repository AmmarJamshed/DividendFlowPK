import PageHero from '../ui/PageHero';

export default function AuthCard({ eyebrow, title, description, children }) {
  return (
    <div className="max-w-lg mx-auto">
      <PageHero eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

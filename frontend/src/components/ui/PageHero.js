export default function PageHero({ eyebrow, title, description, children, className = '' }) {
  return (
    <div className={`fin-hero rounded-3xl border border-teal-200/60 bg-gradient-to-br from-white via-teal-50/30 to-cyan-50/40 p-5 sm:p-7 shadow-md shadow-teal-100/40 ${className}`}>
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600 mb-2">{eyebrow}</p>
      )}
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">{description}</p>
      )}
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

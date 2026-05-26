const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

export default function PageHero({
  eyebrow,
  title,
  description,
  children,
  variant = 'dark',
  className = '',
  showLogo = true,
}) {
  const isDark = variant === 'dark';

  return (
    <div
      className={`fin-hero p-6 sm:p-8 lg:p-10 ${isDark ? 'fin-hero--dark' : 'fin-hero--light'} ${className}`}
    >
      {showLogo && (
        <img
          src={LOGO}
          alt=""
          className="absolute -right-4 -top-4 w-28 sm:w-36 opacity-25 pointer-events-none select-none"
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1]">
        {eyebrow && (
          <p
            className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] mb-3 px-2.5 py-1 rounded-full ${
              isDark ? 'bg-white/10 text-amber-100' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#c5a667]" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1
          className={`text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight max-w-4xl ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          {title}
        </h1>
        {description && (
          <p
            className={`mt-4 text-sm sm:text-base leading-relaxed max-w-3xl ${
              isDark ? 'text-slate-200' : 'text-slate-600'
            }`}
          >
            {description}
          </p>
        )}
        {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
      </div>
    </div>
  );
}

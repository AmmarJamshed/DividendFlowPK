const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

export default function PageHero({
  eyebrow,
  title,
  description,
  children,
  variant = 'light',
  className = '',
  showLogo = true,
}) {
  const isTeal = variant === 'teal';

  return (
    <div
      className={`fin-hero p-6 sm:p-8 lg:p-10 ${isTeal ? 'fin-hero--teal' : ''} ${className}`}
    >
      {showLogo && !isTeal && (
        <img
          src={LOGO}
          alt=""
          className="absolute -right-2 -top-2 w-24 sm:w-32 opacity-20 pointer-events-none select-none"
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1]">
        {eyebrow && (
          <p
            className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest mb-3 px-2.5 py-1 rounded-full ${
              isTeal ? 'bg-white/15 text-teal-50' : 'bg-teal-100/80 text-teal-700 border border-teal-200/60'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isTeal ? 'bg-amber-300 animate-pulse' : 'bg-teal-500'}`}
              aria-hidden
            />
            {eyebrow}
          </p>
        )}
        <h1
          className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight max-w-4xl ${
            isTeal ? 'text-white' : 'text-slate-900'
          }`}
        >
          {title}
        </h1>
        {description && (
          <p
            className={`mt-4 text-sm sm:text-base leading-relaxed max-w-3xl ${
              isTeal ? 'text-teal-50/95' : 'text-slate-600'
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

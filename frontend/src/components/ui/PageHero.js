const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

export default function PageHero({
  eyebrow,
  title,
  description,
  children,
  variant = 'light',
  className = '',
  showLogo = false,
}) {
  const isBrand = variant === 'brand' || variant === 'teal';

  return (
    <div
      className={`df-hero-card relative overflow-hidden ${isBrand ? 'text-white border-[#1E3A8A]' : ''} ${className}`}
      style={
        isBrand
          ? { backgroundImage: 'linear-gradient(135deg, #1E3A8A 0%, #1e40af 55%, #172554 100%)' }
          : undefined
      }
    >
      {showLogo && !isBrand && (
        <img
          src={LOGO}
          alt=""
          className="absolute right-3 top-3 w-16 sm:w-20 opacity-[0.06] pointer-events-none select-none rounded-lg"
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1]">
        {eyebrow && (
          <span className={`df-tag ${isBrand ? 'bg-white/15 text-white' : ''}`}>{eyebrow}</span>
        )}
        <h2
          className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight max-w-4xl mt-3 ${
            isBrand ? 'text-white' : 'text-slate-900'
          }`}
        >
          {title}
        </h2>
        {description && (
          <p
            className={`mt-3 text-sm sm:text-base leading-relaxed max-w-3xl ${
              isBrand ? 'text-blue-100' : 'text-slate-600'
            }`}
          >
            {description}
          </p>
        )}
        {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
      </div>
    </div>
  );
}

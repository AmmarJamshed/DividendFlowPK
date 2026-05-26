export default function PageHero({ eyebrow, title, description, children, variant = 'dark', className = '' }) {
  const isDark = variant === 'dark';

  return (
    <div
      className={`fin-hero p-6 sm:p-8 lg:p-10 ${isDark ? 'fin-hero--dark' : 'fin-hero--light'} ${className}`}
    >
      {eyebrow && (
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] mb-3 ${
            isDark ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h1
        className={`text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-tight max-w-4xl ${
          isDark ? 'text-white' : 'text-neutral-900'
        }`}
      >
        {title}
      </h1>
      {description && (
        <p
          className={`mt-4 text-sm sm:text-base leading-relaxed max-w-3xl ${
            isDark ? 'text-neutral-300' : 'text-neutral-600'
          }`}
        >
          {description}
        </p>
      )}
      {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

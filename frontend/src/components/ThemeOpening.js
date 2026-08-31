const THEME_YOUTUBE_ID = '1PqDWTfUNHQ';

/**
 * Official DividendFlow PK theme opening (YouTube).
 */
export default function ThemeOpening({ compact = false }) {
  const embedSrc = `https://www.youtube.com/embed/${THEME_YOUTUBE_ID}?rel=0&modestbranding=1`;

  return (
    <section className={compact ? '' : 'df-theme-section'} aria-labelledby="theme-song-heading">
      <div className={compact ? '' : 'max-w-[1200px] mx-auto px-4 lg:px-6 py-12 lg:py-16'}>
        <div className="max-w-2xl mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97316]">
            Official theme opening
          </p>
          <h2
            id="theme-song-heading"
            className="mt-2 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
          >
            Gotta Track &apos;Em All
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            The DividendFlow PK opening — markets, IPOs, dividends, and the race through the charts.
          </p>
        </div>

        <div className="df-theme-video-frame">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedSrc}
            title="DividendFlow PK theme song — Gotta Track 'Em All"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Watch on{' '}
          <a
            className="font-semibold text-[#1E3A8A] underline underline-offset-2"
            href={`https://www.youtube.com/watch?v=${THEME_YOUTUBE_ID}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube
          </a>
          . For learning and research — not buy/sell advice.
        </p>
      </div>
    </section>
  );
}

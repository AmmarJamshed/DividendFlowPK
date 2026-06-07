#!/usr/bin/env node
/**
 * CI check: PSX scrape CSVs should match the latest expected trading day.
 * Exits 1 if prices or news are stale; warns on empty commentary files.
 */
const path = require('path');

async function main() {
  const { getScrapeFreshnessReport } = require(path.join(__dirname, '..', 'backend', 'services', 'scrapeFreshness'));
  const report = await getScrapeFreshnessReport();
  console.log(JSON.stringify(report, null, 2));

  const price = report.sources?.psx_prices;
  const news = report.sources?.daily_news;
  const errors = [];

  if (!price?.maxDataDate || price.status === 'stale' || price.status === 'missing') {
    errors.push(`PSX prices stale: max=${price?.maxDataDate || 'none'} expected=${report.expectedLatestTradingDay}`);
  }
  if (!news?.maxDataDate || news.status === 'stale') {
    errors.push(`News stale: max=${news?.maxDataDate || 'none'}`);
  }
  if (report.sources?.ai_commentary?.status === 'empty') {
    console.warn('[verify-scrape-freshness] WARN: ai_commentary.csv is empty — sentiment pipeline may need GROQ_API_KEY');
  }
  if (report.sources?.price_commentary?.status === 'empty') {
    console.warn('[verify-scrape-freshness] WARN: price_commentary.csv is empty');
  }

  if (errors.length) {
    console.error('[verify-scrape-freshness] FAILED:', errors.join('; '));
    process.exit(1);
  }
  console.log('[verify-scrape-freshness] OK — data through', price.maxDataDate);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

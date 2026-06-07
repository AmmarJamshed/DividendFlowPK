-- DividendFlow.pk core schema (also applied to project dbkytlsejpxmclpznudk)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  market_close_local TIME,
  yfinance_suffix TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS securities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  industry TEXT,
  isin TEXT,
  shariah_compliant BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_securities_symbol ON securities(symbol);
CREATE INDEX IF NOT EXISTS idx_securities_exchange ON securities(exchange_id);

CREATE TABLE IF NOT EXISTS daily_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  open NUMERIC(18,4),
  high NUMERIC(18,4),
  low NUMERIC(18,4),
  close NUMERIC(18,4),
  ldcp NUMERIC(18,4),
  change_amount NUMERIC(18,4),
  change_pct NUMERIC(10,4),
  volume BIGINT,
  currency TEXT NOT NULL DEFAULT 'PKR',
  source TEXT NOT NULL DEFAULT 'psx_scraper',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(trade_date DESC);

CREATE TABLE IF NOT EXISTS dividend_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  dividend_per_share NUMERIC(18,4),
  payment_month SMALLINT CHECK (payment_month BETWEEN 1 AND 12),
  dividend_yield NUMERIC(10,4),
  price NUMERIC(18,4),
  year SMALLINT,
  source TEXT NOT NULL DEFAULT 'calendar_csv',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, year, payment_month)
);

CREATE TABLE IF NOT EXISTS dividend_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  dividend_announcement TEXT,
  announcement_date DATE,
  book_closure DATE,
  book_closure_end DATE,
  payment_month SMALLINT,
  year SMALLINT,
  source TEXT NOT NULL DEFAULT 'psx_payouts',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dividend_payouts_security ON dividend_payouts(security_id);

CREATE TABLE IF NOT EXISTS quarter_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  fiscal_year_end TEXT,
  quarter_end_months TEXT,
  dividend_announcement_period TEXT,
  book_closure_month TEXT,
  estimated_payment_month TEXT,
  source TEXT NOT NULL DEFAULT 'psx_cycles',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  price_date DATE NOT NULL,
  close_price NUMERIC(18,4) NOT NULL,
  source TEXT NOT NULL DEFAULT 'daily_prices_csv',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, price_date)
);

CREATE TABLE IF NOT EXISTS price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  price NUMERIC(18,4),
  previous_price NUMERIC(18,4),
  change_amount NUMERIC(18,4),
  change_pct NUMERIC(10,4),
  change_date DATE,
  source TEXT NOT NULL DEFAULT 'price_changes_csv',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, change_date)
);

CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID REFERENCES securities(id) ON DELETE SET NULL,
  company_symbol TEXT,
  headline TEXT NOT NULL,
  published_date DATE,
  source TEXT,
  url TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_date DESC);

CREATE TABLE IF NOT EXISTS news_ai_commentary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID REFERENCES securities(id) ON DELETE SET NULL,
  company_symbol TEXT NOT NULL,
  commentary TEXT NOT NULL,
  commentary_date DATE,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_price_commentary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID REFERENCES securities(id) ON DELETE SET NULL,
  company_symbol TEXT NOT NULL,
  direction TEXT,
  change_pct NUMERIC(10,4),
  commentary TEXT NOT NULL,
  commentary_date DATE,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  market_cap NUMERIC(20,2),
  pe_ratio NUMERIC(12,4),
  eps NUMERIC(12,4),
  week_52_high NUMERIC(18,4),
  week_52_low NUMERIC(18,4),
  dividend_yield NUMERIC(10,4),
  source TEXT NOT NULL DEFAULT 'scraper',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID REFERENCES securities(id) ON DELETE CASCADE,
  exchange_code TEXT,
  insight_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence SMALLINT CHECK (confidence BETWEEN 0 AND 100),
  model TEXT,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file TEXT NOT NULL,
  exchange_code TEXT,
  rows_processed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exchanges (code, name, country, currency, timezone, market_close_local, yfinance_suffix)
VALUES
  ('PSX', 'Pakistan Stock Exchange', 'PK', 'PKR', 'Asia/Karachi', '15:30', '.KA'),
  ('NYSE', 'New York Stock Exchange', 'US', 'USD', 'America/New_York', '16:00', ''),
  ('NASDAQ', 'NASDAQ', 'US', 'USD', 'America/New_York', '16:00', ''),
  ('TADAWUL', 'Saudi Exchange (Tadawul)', 'SA', 'SAR', 'Asia/Riyadh', '15:00', '.SR'),
  ('SSE', 'Shanghai Stock Exchange', 'CN', 'CNY', 'Asia/Shanghai', '15:00', '.SS'),
  ('HKEX', 'Hong Kong Stock Exchange', 'HK', 'HKD', 'Asia/Hong_Kong', '16:00', '.HK'),
  ('TSE', 'Tokyo Stock Exchange', 'JP', 'JPY', 'Asia/Tokyo', '15:00', '.T'),
  ('LSE', 'London Stock Exchange', 'GB', 'GBP', 'Europe/London', '16:30', '.L')
ON CONFLICT (code) DO NOTHING;

-- Global dividend history + company dividend profiles (yfinance / quarterly sync)

CREATE TABLE IF NOT EXISTS dividend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  ex_date DATE,
  record_date DATE,
  payment_date DATE,
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  frequency TEXT,
  dividend_type TEXT DEFAULT 'regular',
  source TEXT NOT NULL DEFAULT 'yfinance',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (security_id, ex_date, amount)
);

CREATE INDEX IF NOT EXISTS idx_dividend_events_security ON dividend_events(security_id);
CREATE INDEX IF NOT EXISTS idx_dividend_events_payment ON dividend_events(payment_date DESC);

CREATE TABLE IF NOT EXISTS dividend_profiles (
  security_id UUID PRIMARY KEY REFERENCES securities(id) ON DELETE CASCADE,
  annual_rate NUMERIC(18,6),
  dividend_yield NUMERIC(10,4),
  frequency TEXT,
  ex_dividend_date DATE,
  next_payment_date DATE,
  fiscal_year_end TEXT,
  trailing_12m_total NUMERIC(18,6),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'yfinance'
);

ALTER TABLE dividend_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividend_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY dividend_events_read ON dividend_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dividend_events_service ON dividend_events FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dividend_profiles_read ON dividend_profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY dividend_profiles_service ON dividend_profiles FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

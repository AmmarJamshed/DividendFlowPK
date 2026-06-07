-- Phase 5 user features + forecast history (global platform)
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID,
  name TEXT NOT NULL DEFAULT 'My Watchlist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  exchange_code TEXT NOT NULL,
  symbol TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, exchange_code, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);

CREATE TABLE IF NOT EXISTS forecast_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID REFERENCES securities(id) ON DELETE CASCADE,
  exchange_code TEXT,
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  horizon_days INT NOT NULL DEFAULT 30,
  low NUMERIC(18,4),
  mid NUMERIC(18,4),
  high NUMERIC(18,4),
  method TEXT NOT NULL DEFAULT 'volatility_bands',
  confidence SMALLINT CHECK (confidence BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_history_symbol ON forecast_history(symbol, as_of_date DESC);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY watchlists_service ON watchlists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY watchlist_items_service ON watchlist_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY forecast_history_read ON forecast_history FOR SELECT USING (true);
CREATE POLICY forecast_history_service ON forecast_history FOR ALL USING (true) WITH CHECK (true);

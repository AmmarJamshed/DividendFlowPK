# Price Data

## Files

- **daily_prices.csv** – Company, Date, Price. History of closing prices (last 14 days kept).
- **price_changes.csv** – Output from run-news (legacy; backend now computes from daily_prices).

## Today vs Yesterday

The dashboard gainers/decliners are computed from `daily_prices.csv` by comparing the two most recent dates.

**When seeding or updating:** Include both gainers and decliners. The market has both—avoid data where all stocks are gainers or all flat.

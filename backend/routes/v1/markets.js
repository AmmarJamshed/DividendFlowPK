const express = require('express');
const exchangeService = require('../../services/exchangeService');
const globalDataStore = require('../../services/globalDataStore');
const exchangeNews = require('../../services/exchangeNews');

const router = express.Router();

router.get('/supported', (_req, res) => {
  res.json({ exchanges: exchangeNews.listSupportedExchanges() });
});

router.post('/:exchange/sync-universe', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const result = await ensureExchangeUniverse(code);
    res.json({ exchange: code, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:exchange/ingest/trigger', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const map = {
      NASDAQ: 'global-ingest-nasdaq.yml',
      NYSE: 'global-ingest-nyse.yml',
      HKEX: 'global-ingest-hkex.yml',
      LSE: 'global-ingest-lse.yml',
    };
    const workflow = map[code];
    if (!workflow) {
      return res.status(400).json({ error: `No GitHub ingest workflow mapped for ${code}` });
    }
    res.json({
      exchange: code,
      workflow,
      hint: 'Trigger manually in GitHub Actions → workflow_dispatch, or wait for the scheduled cron.',
      shardCount: code === 'NASDAQ' || code === 'NYSE' ? 10 : 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:exchange/closing-prices', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const payload = await globalDataStore.getClosingPrices(code);
    const rows = (payload.rows || []).filter((r) => r.close != null && r.close > 0);
    const gainers = rows
      .filter((r) => typeof r.changePct === 'number' && r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct);
    const losers = rows
      .filter((r) => typeof r.changePct === 'number' && r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct);
    res.json({
      ...payload,
      rows,
      summary: {
        totalCompanies: rows.length,
        topGainer: gainers[0] || null,
        topLoser: losers[0] || null,
        date: payload.date,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:exchange/dividends', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const filters = {
      month: req.query.month,
      sector: req.query.sector,
      minYield: req.query.minYield,
    };
    const result = await globalDataStore.getDividendsForExchange(code, filters);
    const rows = Array.isArray(result) ? result : result.rows;
    const summary = Array.isArray(result) ? null : result.summary;
    res.json({ exchange: code, rows, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:exchange/daily-news', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const payload = await exchangeNews.getDailyNewsForExchange(code);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

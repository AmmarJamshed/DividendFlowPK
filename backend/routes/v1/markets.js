const express = require('express');
const exchangeService = require('../../services/exchangeService');
const globalDataStore = require('../../services/globalDataStore');
const exchangeNews = require('../../services/exchangeNews');

const router = express.Router();

router.get('/supported', (_req, res) => {
  res.json({ exchanges: exchangeNews.listSupportedExchanges() });
});

router.get('/:exchange/closing-prices', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.params.exchange);
    const payload = await globalDataStore.getClosingPrices(code);
    const rows = payload.rows || [];
    const gainers = [...rows].sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, 5);
    const losers = [...rows].sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, 5);
    res.json({
      ...payload,
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
    const rows = await globalDataStore.getDividendsForExchange(code, {
      month: req.query.month,
      sector: req.query.sector,
      minYield: req.query.minYield,
    });
    res.json({ exchange: code, rows });
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

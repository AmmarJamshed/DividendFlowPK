const express = require('express');
const globalDataStore = require('../../services/globalDataStore');
const exchangeService = require('../../services/exchangeService');

const router = express.Router();

router.get('/:exchange/:symbol', async (req, res) => {
  try {
    const code = exchangeService.assertExchangeSupported(req.params.exchange);
    const symbol = String(req.params.symbol || '').toUpperCase();
    const detail = await globalDataStore.getStockDetail(code, symbol);
    if (!detail) {
      return res.status(404).json({ error: 'Security not found', exchange: code, symbol });
    }
    res.json(detail);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;

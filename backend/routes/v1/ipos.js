const express = require('express');
const exchangeService = require('../../services/exchangeService');
const ipoService = require('../../services/ipoService');

const router = express.Router();

router.get('/supported', (_req, res) => {
  res.json({ exchanges: ipoService.listSupportedIpoExchanges() });
});

router.get('/:exchange', (req, res) => {
  try {
    const code = exchangeService.assertExchangeSupported(req.params.exchange);
    const includeClosed = String(req.query.includeClosed || '').toLowerCase() === 'true';
    const payload = ipoService.getIposForExchange(code, { includeClosed });
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;

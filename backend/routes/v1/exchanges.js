const express = require('express');
const exchangeService = require('../../services/exchangeService');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ exchanges: exchangeService.listExchanges() });
});

module.exports = router;

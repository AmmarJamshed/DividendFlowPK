const express = require('express');
const globalDataStore = require('../../services/globalDataStore');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    if (!q) return res.json({ results: [] });
    const results = await globalDataStore.searchSecurities(q, limit);
    res.json({ query: q, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

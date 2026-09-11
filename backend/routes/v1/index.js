const express = require('express');
const marketsRouter = require('./markets');
const searchRouter = require('./search');
const stocksRouter = require('./stocks');
const exchangesRouter = require('./exchanges');
const watchlistRouter = require('./watchlist');
const iposRouter = require('./ipos');
const researchRouter = require('./research');

const router = express.Router();

router.use('/exchanges', exchangesRouter);
router.use('/markets', marketsRouter);
router.use('/search', searchRouter);
router.use('/stocks', stocksRouter);
router.use('/watchlist', watchlistRouter);
router.use('/ipos', iposRouter);
router.use('/research', researchRouter);

module.exports = router;

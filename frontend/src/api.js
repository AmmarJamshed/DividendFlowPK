import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function watchlistHeaders(sessionId) {
  return sessionId ? { 'X-Watchlist-Session': sessionId } : {};
}

export const api = {
  postContact: (body) => axios.post(`${API_BASE}/contact`, body, { timeout: 30000 }),
  getDividends: () => axios.get(`${API_BASE}/dividends`),
  getMonthCoverage: () => axios.get(`${API_BASE}/month-coverage`),
  getRiskScore: (companyName) => axios.post(`${API_BASE}/risk-score`, { companyName }),
  getForecast: (company, asOf) => axios.get(`${API_BASE}/forecast`, { params: { company, asOf } }),
  getSalarySimulator: (targetMonthlyIncome, expectedDividendYield) =>
    axios.post(`${API_BASE}/salary-simulator`, { targetMonthlyIncome, expectedDividendYield }),
  postSalaryAiRecommendations: (body) =>
    axios.post(`${API_BASE}/salary-simulator/ai-recommendations`, body, { timeout: 60000 }),
  getReportingCycles: () => axios.get(`${API_BASE}/reporting-cycles`),
  getCapitalGain: (company) => axios.get(`${API_BASE}/capital-gain`, { params: { company } }),
  getDataStatus: () => axios.get(`${API_BASE}/data-status`),
  getDailyNews: (exchange = 'PSX') =>
    axios.get(`${API_BASE}/daily-news`, { params: { exchange } }),
  getExchangeDailyNews: (exchange) =>
    axios.get(`${API_BASE}/v1/markets/${exchange}/daily-news`),
  getMarketClosingPrices: (exchange = 'PSX') =>
    exchange === 'PSX'
      ? axios.get(`${API_BASE}/market-closing-prices`)
      : axios.get(`${API_BASE}/v1/markets/${exchange}/closing-prices`),
  getMarketIndex: (exchange = 'PSX', days = 180) =>
    axios.get(`${API_BASE}/market-index/${exchange}`, { params: { days } }),
  getExchanges: () => axios.get(`${API_BASE}/v1/exchanges`),
  searchSecurities: (q, limit = 20) =>
    axios.get(`${API_BASE}/v1/search`, { params: { q, limit } }),
  getStock: (exchange, symbol) => axios.get(`${API_BASE}/v1/stocks/${exchange}/${symbol}`),
  getMarketDividends: (exchange, params) =>
    axios.get(`${API_BASE}/v1/markets/${exchange}/dividends`, { params }),
  getIpos: (exchange = 'PSX', params) =>
    axios.get(`${API_BASE}/v1/ipos/${exchange}`, { params }),
  getWatchlist: (sessionId) =>
    axios.get(`${API_BASE}/v1/watchlist`, { headers: watchlistHeaders(sessionId) }),
  addWatchlistItem: (sessionId, exchange, symbol) =>
    axios.post(
      `${API_BASE}/v1/watchlist/items`,
      { exchange, symbol, sessionId },
      { headers: watchlistHeaders(sessionId) }
    ),
  removeWatchlistItem: (sessionId, exchange, symbol) =>
    axios.delete(`${API_BASE}/v1/watchlist/items/${exchange}/${symbol}`, {
      headers: watchlistHeaders(sessionId),
    }),
  postSiteGuide: (body, config) => axios.post(`${API_BASE}/ai-site-guide`, body, config),
  postMarketChat: (body) => axios.post(`${API_BASE}/market-chat`, body),
  postDividendCalculator: (holdings) =>
    axios.post(`${API_BASE}/dividend-calculator`, { holdings }),
  postDividendCalculatorPdf: (file) => {
    const form = new FormData();
    form.append('file', file);
    return axios.post(`${API_BASE}/dividend-calculator/pdf`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    });
  },
};

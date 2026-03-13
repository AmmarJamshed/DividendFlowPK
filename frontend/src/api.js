import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const api = {
  getDividends: () => axios.get(`${API_BASE}/dividends`),
  getMonthCoverage: () => axios.get(`${API_BASE}/month-coverage`),
  getRiskScore: (companyName) => axios.post(`${API_BASE}/risk-score`, { companyName }),
  getForecast: (company, asOf) => axios.get(`${API_BASE}/forecast`, { params: { company, asOf } }),
  getSalarySimulator: (targetMonthlyIncome, expectedDividendYield) =>
    axios.post(`${API_BASE}/salary-simulator`, { targetMonthlyIncome, expectedDividendYield }),
  getReportingCycles: () => axios.get(`${API_BASE}/reporting-cycles`),
  getCapitalGain: (company) => axios.get(`${API_BASE}/capital-gain`, { params: { company } }),
  getDataStatus: () => axios.get(`${API_BASE}/data-status`),
  getDailyNews: () => axios.get(`${API_BASE}/daily-news`),
  getMarketClosingPrices: () => axios.get(`${API_BASE}/market-closing-prices`),
};

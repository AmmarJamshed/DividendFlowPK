import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DividendCalendar from './pages/DividendCalendar';
import WeakMonthOptimizer from './pages/WeakMonthOptimizer';
import AIRiskDashboard from './pages/AIRiskDashboard';
import ForecastEngine from './pages/ForecastEngine';
import SalarySimulator from './pages/SalarySimulator';
import ReportingCycles from './pages/ReportingCycles';
import MarketClosingPrices from './pages/MarketClosingPrices';

function Analytics() {
  const location = useLocation();
  
  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', 'G-PZ2NCRQ5TX', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
  
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <Analytics />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dividend-calendar" element={<DividendCalendar />} />
          <Route path="/market-closing-prices" element={<MarketClosingPrices />} />
          <Route path="/weak-month-optimizer" element={<WeakMonthOptimizer />} />
          <Route path="/ai-risk-dashboard" element={<AIRiskDashboard />} />
          <Route path="/forecast-engine" element={<ForecastEngine />} />
          <Route path="/salary-simulator" element={<SalarySimulator />} />
          <Route path="/reporting-cycles" element={<ReportingCycles />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DividendCalendar from './pages/DividendCalendar';
import AIRiskDashboard from './pages/AIRiskDashboard';
import ForecastEngine from './pages/ForecastEngine';
import SalarySimulator from './pages/SalarySimulator';
import ReportingCycles from './pages/ReportingCycles';
import MarketClosingPrices from './pages/MarketClosingPrices';
import { AIAssistanceProvider } from './context/AIAssistanceContext';

/** GitHub project Pages live under /RepoName/; match react-router to that prefix. */
function routerBasename() {
  const raw = process.env.PUBLIC_URL;
  if (!raw || raw === '/') return undefined;
  const b = String(raw).replace(/\/$/, '');
  return b || undefined;
}

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
    <BrowserRouter basename={routerBasename()}>
      <Analytics />
      <AIAssistanceProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dividend-calendar" element={<DividendCalendar />} />
            <Route path="/market-closing-prices" element={<MarketClosingPrices />} />
            <Route path="/weak-month-optimizer" element={<Navigate to="/dividend-calendar" replace />} />
            <Route path="/ai-risk-dashboard" element={<AIRiskDashboard />} />
            <Route path="/forecast-engine" element={<ForecastEngine />} />
            <Route path="/salary-simulator" element={<SalarySimulator />} />
            <Route path="/reporting-cycles" element={<ReportingCycles />} />
          </Routes>
        </Layout>
      </AIAssistanceProvider>
    </BrowserRouter>
  );
}

export default App;

import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import DividendCalendar from './pages/DividendCalendar';
import ForecastEngine from './pages/ForecastEngine';
import SalarySimulator from './pages/SalarySimulator';
import ReportingCycles from './pages/ReportingCycles';
import MarketBrokers from './pages/MarketBrokers';
import IpoCalendar from './pages/IpoCalendar';
import MarketClosingPrices from './pages/MarketClosingPrices';
import StockPage from './pages/StockPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import About from './pages/About';
import Contact from './pages/Contact';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import CompleteProfile from './pages/CompleteProfile';
import AuthCallback from './pages/AuthCallback';
import { AIAssistanceProvider } from './context/AIAssistanceContext';
import { MarketBuddyProvider } from './context/MarketBuddyContext';
import { ExchangeProvider } from './context/ExchangeContext';
import { AuthProvider } from './context/AuthContext';

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
      window.gtag('config', 'G-FMRQYTXT13', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
}

function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <AuthProvider>
        <Analytics />
        <AIAssistanceProvider>
          <ExchangeProvider>
            <MarketBuddyProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sign-in" element={<SignIn />} />
                  <Route path="/sign-up" element={<SignUp />} />
                  <Route path="/complete-profile" element={<CompleteProfile />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/dividend-calendar" element={<ProtectedRoute><DividendCalendar /></ProtectedRoute>} />
                  <Route path="/market-closing-prices" element={<ProtectedRoute><MarketClosingPrices /></ProtectedRoute>} />
                  <Route path="/ipo-calendar" element={<ProtectedRoute><IpoCalendar /></ProtectedRoute>} />
                  <Route path="/stock/:exchange/:symbol" element={<ProtectedRoute><StockPage /></ProtectedRoute>} />
                  <Route path="/weak-month-optimizer" element={<Navigate to="/dividend-calendar" replace />} />
                  <Route path="/ai-risk-dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/forecast-engine" element={<ProtectedRoute><ForecastEngine /></ProtectedRoute>} />
                  <Route path="/salary-simulator" element={<ProtectedRoute><SalarySimulator /></ProtectedRoute>} />
                  <Route path="/reporting-cycles" element={<ProtectedRoute><ReportingCycles /></ProtectedRoute>} />
                  <Route path="/market-brokers" element={<ProtectedRoute><MarketBrokers /></ProtectedRoute>} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                </Routes>
              </Layout>
            </MarketBuddyProvider>
          </ExchangeProvider>
        </AIAssistanceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

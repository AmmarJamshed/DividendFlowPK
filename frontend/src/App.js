import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ComingSoon from './pages/ComingSoon';

/** GitHub project Pages live under /RepoName/; match react-router to that prefix. */
function routerBasename() {
  const raw = process.env.PUBLIC_URL;
  if (!raw || raw === '/') return undefined;
  const b = String(raw).replace(/\/$/, '');
  return b || undefined;
}

/**
 * Site temporarily offline — all routes show the surprise / waitlist page.
 * Restore the full app from git history when relaunching.
 */
function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route path="/" element={<ComingSoon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

// App.jsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

const Footer = lazy(() => import('./components/Footer'));
const BackToTop = lazy(() => import('./components/BackToTop'));

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Screener = lazy(() => import('./pages/Screener'));
const Compare = lazy(() => import('./pages/Compare'));
const SIPCalculator = lazy(() => import('./pages/SIPCalculator'));

// Per-route titles — updates document.title on every navigation
const ROUTE_TITLES = {
  '/':        'FundLens — Mutual Fund Research & Analysis',
  '/screener':'Fund Screener — Browse 37,000+ Mutual Funds | FundLens',
  '/compare': 'Compare Funds Side-by-Side | FundLens',
  '/sip':     'SIP & FIRE Calculator | FundLens',
};

function PageTitleUpdater() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = ROUTE_TITLES[pathname] ?? 'FundLens — Mutual Fund Analysis Platform';
    document.title = title;
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      {/* Skip-to-content link for keyboard/accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-bold focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <ToastProvider>
        <BrowserRouter>
          <PageTitleUpdater />
          <NavBar />
          <main id="main-content" className="md:mt-16 mt-14 min-h-screen flex flex-col" role="main" aria-label="Main content">
            <div className="flex-1">
              <ErrorBoundary>
                <Suspense fallback={
                  <div className="min-h-[50vh] flex items-center justify-center px-4" role="status" aria-label="Loading page">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Loading page...</div>
                  </div>
                }>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/screener" element={<Screener />} />
                    <Route path="/compare" element={<Compare />} />
                    <Route path="/sip" element={<SIPCalculator />} />
                    {/* Catch-all: redirect any unknown URL to home */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </div>
            <Suspense fallback={null}><Footer /></Suspense>
          </main>
          <Suspense fallback={null}><BackToTop /></Suspense>
        </BrowserRouter>
      </ToastProvider>
    </>
  );
}

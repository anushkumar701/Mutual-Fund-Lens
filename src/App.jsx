// App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import BackToTop from './components/BackToTop';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Screener = lazy(() => import('./pages/Screener'));
const Compare = lazy(() => import('./pages/Compare'));
const SIPCalculator = lazy(() => import('./pages/SIPCalculator'));

// Apply theme immediately before first paint
const savedTheme = localStorage.getItem('fundlens_theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <NavBar />
        <main className="md:mt-16 mt-14 min-h-screen flex flex-col">
          <div className="flex-1">
            <ErrorBoundary>
              <Suspense fallback={
                <div className="min-h-[50vh] flex items-center justify-center px-4">
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
          <Footer />
        </main>
        <BackToTop />
      </BrowserRouter>
    </ToastProvider>
  );
}

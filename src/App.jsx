// App.jsx
import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import NavBar from "./components/NavBar";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

import Footer from "./components/Footer";
import BackToTop from "./components/BackToTop";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Screener = lazy(() => import("./pages/Screener"));
const Compare = lazy(() => import("./pages/Compare"));
const SIPCalculator = lazy(() => import("./pages/SIPCalculator"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
import { usePortfolioNotifications } from "./hooks/usePortfolioNotifications";

// Per-route SEO — updates document.title, meta description, and canonical URL
const ROUTE_SEO = {
  "/": {
    title: "Portfolio Tracker — Live Mutual Fund Valuation | FundLens",
    description:
      "Track your mutual fund holdings, view real-time valuation gains/losses, analyze historical performance curves, and get daily updates.",
  },
  "/dashboard": {
    title: "FundLens — Mutual Fund Research & Analysis",
    description:
      "FundLens — India's beginner-friendly mutual fund analysis platform. Search 37,000+ funds, compare performance, and plan investments.",
  },
  "/screener": {
    title: "Fund Screener — Browse 37,000+ Mutual Funds | FundLens",
    description:
      "Filter and browse 37,000+ Indian mutual funds by category, risk, expense ratio, and AMC. Find the right fund for your goals.",
  },
  "/compare": {
    title: "Compare Funds Side-by-Side | FundLens",
    description:
      "Compare up to 4 mutual funds side-by-side with NAV charts, rolling returns, SIP simulation, and overlap analysis.",
  },
  "/sip": {
    title: "SIP & FIRE Calculator | FundLens",
    description:
      "Calculate SIP returns, plan FIRE retirement, estimate ELSS tax savings, and simulate SWP withdrawals — all free.",
  },
};

const BASE_URL = "https://fundlens.netlify.app";

function PageSEOUpdater() {
  const { pathname } = useLocation();
  useEffect(() => {
    const seo = ROUTE_SEO[pathname] ?? {
      title: "FundLens — Mutual Fund Analysis Platform",
      description:
        "FundLens — India's beginner-friendly mutual fund analysis and screening platform.",
    };

    // Update title
    document.title = seo.title;

    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", seo.description);
    }

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute(
        "href",
        `${BASE_URL}${pathname === "/" ? "/" : pathname}`,
      );
    }

    // Update Open Graph URL
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute(
        "content",
        `${BASE_URL}${pathname === "/" ? "/" : pathname}`,
      );
    }
  }, [pathname]);
  return null;
}

export default function App() {
  usePortfolioNotifications();
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
          <PageSEOUpdater />
          <header>
            <NavBar />
          </header>
          <main
            id="main-content"
            className="md:pt-16 pt-14 min-h-screen flex flex-col overflow-x-hidden"
            aria-label="Main content"
          >
            <div className="flex-1">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div
                      className="min-h-[50vh] flex items-center justify-center px-4"
                      role="status"
                      aria-label="Loading page"
                    >
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Loading page...
                      </div>
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<Portfolio />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/screener" element={<Screener />} />
                    <Route path="/compare" element={<Compare />} />
                    <Route path="/sip" element={<SIPCalculator />} />
                    <Route path="/portfolio" element={<Navigate to="/" replace />} />
                    {/* Catch-all: redirect any unknown URL to home */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </div>
            <Suspense fallback={null}>
              <Footer />
            </Suspense>
          </main>
          <Suspense fallback={null}>
            <BackToTop />
          </Suspense>
          <PWAInstallPrompt />
        </BrowserRouter>
      </ToastProvider>
    </>
  );
}

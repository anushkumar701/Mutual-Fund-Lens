import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ─── Sentry Error Tracking (loaded async to avoid blocking first paint) ───
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  const initSentry = () => {
    import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        integrations: [
          Sentry.browserTracingIntegration(),
        ],
        tracesSampleRate: import.meta.env.PROD ? 0.1 : 0.0,
      });
    }).catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initSentry, { timeout: 3000 });
  } else {
    setTimeout(initSentry, 2000);
  }
}

// ─── Post-First-Paint Initialization ─────────────────────────
// Defer non-critical work to avoid blocking the main thread during initial render
const deferredInit = () => {
  // Web Vitals Performance Monitoring (dev only in production)
  if (typeof window !== 'undefined' && 'performance' in window && 'PerformanceObserver' in window) {
    if (import.meta.env.DEV) {
      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            const metric = {
              name: entry.name,
              value: entry.startTime || entry.processingStart || entry.renderTime || 0,
              rating: entry.startTime < 2500 ? 'good' : entry.startTime < 4000 ? 'needs-improvement' : 'poor',
            };
            console.debug(`[Web Vitals] ${metric.name}: ${Math.round(metric.value)}ms (${metric.rating})`);
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch { /* silently ignore */ }

      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            console.debug(`[Web Vitals] First Input Delay: ${entry.processingStart - entry.startTime}ms`);
          }
        }).observe({ type: 'first-input', buffered: true });
      } catch { /* silently ignore */ }

      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            console.debug(`[Web Vitals] Cumulative Layout Shift: ${entry.value}`);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* silently ignore */ }
    }
  }

  // Service Worker cleanup
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});
  }
};

// Schedule after first paint — use requestIdleCallback or fallback to setTimeout
if ('requestIdleCallback' in window) {
  requestIdleCallback(deferredInit, { timeout: 5000 });
} else {
  setTimeout(deferredInit, 3000);
}

// ─── Mount React ─────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

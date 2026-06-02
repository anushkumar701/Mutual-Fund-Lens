// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link } from '@remix-run/react';
import { lazy, Suspense } from 'react';
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import tailwindStyles from './tailwind.css?url';

const Footer = lazy(() => import('./components/Footer'));
const BackToTop = lazy(() => import('./components/BackToTop'));

export const links = () => [
  { rel: 'stylesheet', href: tailwindStyles },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'preload',
    as: 'style',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    // @ts-ignore — onload is valid for preload
    onload: "this.onload=null;this.rel='stylesheet'",
  },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'manifest', href: '/manifest.json' },
];

export const meta = () => [
  { charset: 'utf-8' },
  { title: 'FundLens — Mutual Fund Analysis Platform' },
  {
    name: 'description',
    content:
      'FundLens — India\'s beginner-friendly mutual fund analysis and screening platform. Compare funds, calculate SIP returns, and invest smarter.',
  },
  { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
  { name: 'theme-color', content: '#0f172a' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
        {/* Theme flash prevention — applied before first paint */}
        <script src="/theme-flash.js" />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          />
        </noscript>
      </head>
      <body>
        {/* Skip-to-content link for keyboard/accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-bold focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <NavBar />
          <main
            id="main-content"
            className="md:mt-16 mt-14 min-h-screen flex flex-col"
            role="main"
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
                  <Outlet />
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
        </ToastProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

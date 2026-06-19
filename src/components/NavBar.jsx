// components/NavBar.jsx
import { NavLink } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import { useLocalStorage } from "../hooks/useLocalStorage";

const links = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg
        className="w-5 h-5"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    to: "/screener",
    label: "Screener",
    icon: (
      <svg
        className="w-5 h-5"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
        />
      </svg>
    ),
  },
  {
    to: "/compare",
    label: "Compare",
    icon: (
      <svg
        className="w-5 h-5"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    to: "/sip",
    label: "Wealth Simulator",
    icon: (
      <svg
        className="w-5 h-5"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    to: "/",
    label: "Portfolio",
    icon: (
      <svg
        className="w-5 h-5"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 8v8m-4-5v5m-4-2v2M2 5a2 2 0 012-2h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5z"
        />
      </svg>
    ),
  },
];

// Slug helper: replaces ALL spaces (not just the first) so multi-word labels
// like "SIP Calc" produce "sip-calc" instead of "sip calc".
function toSlug(str) {
  return str.toLowerCase().replaceAll(" ", "-");
}

export default function NavBar() {
  const [watchlist] = useLocalStorage("fundlens_watchlist", []);
  const [portfolioList] = useLocalStorage("fundlens_portfolio", []);
  const [totalValRaw] = useLocalStorage("fundlens_portfolio_total_value", 0);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const isInstalled = 
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      localStorage.getItem("fundlens_pwa_installed") === "1" ||
      !!window.Capacitor;

    if (isInstalled) {
      setShowInstallBtn(false);
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    const handleAppInstalled = () => {
      localStorage.setItem("fundlens_pwa_installed", "1");
      setDeferredPrompt(null);
      setShowInstallBtn(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.debug(`PWA install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const totalValue = useMemo(() => {
    const parsedVal = parseFloat(totalValRaw);
    if (parsedVal > 0) return parsedVal;
    return portfolioList.reduce((acc, h) => acc + (parseFloat(h.amount) || 0), 0);
  }, [portfolioList, totalValRaw]);

  return (
    <>
      {/* Desktop top navbar */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-slate-800 shadow-sm items-center px-6 gap-6"
      >
        {/* Logo */}
        <NavLink
          to="/"
          aria-label="FundLens home"
          className="flex items-center gap-2 mr-6"
        >
          <svg
            className="w-7 h-7 text-blue-600"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline
              points="3,17 9,11 13,15 21,7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="21" cy="7" r="1.5" fill="currentColor" />
          </svg>
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Fund<span className="text-blue-600">Lens</span>
          </span>
        </NavLink>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              id={`nav-${toSlug(label)}`}
              aria-label={label}
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                }`
              }
            >
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Desktop watchlist + total portfolio value indicators */}
        <div className="flex items-center gap-2 text-xs">
          {watchlist.length > 0 && (
            <span
              aria-label={`${watchlist.length} funds saved to watchlist`}
              className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-full px-2.5 py-1 font-medium"
            >
              <svg className="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              <span>{watchlist.length} saved</span>
            </span>
          )}
          {portfolioList.length > 0 && (
            <span
              className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-full px-3 py-1 font-bold shadow-sm"
            >
              <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Portfolio: {formatCurrency(totalValue)}</span>
            </span>
          )}
        </div>

        {showInstallBtn && (
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs shadow-sm hover:shadow transition-all mr-2"
            aria-label="Install FundLens App"
          >
            📥 Install App
          </button>
        )}
        <ThemeToggle />
      </nav>

      {/* Mobile header bar (logo + broker + theme toggle) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
        <NavLink
          to="/"
          aria-label="FundLens home"
          className="flex items-center gap-2"
        >
          <svg
            className="w-6 h-6 text-blue-600"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline
              points="3,17 9,11 13,15 21,7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-lg font-bold text-slate-900 dark:text-white">
            Fund<span className="text-blue-600">Lens</span>
          </span>
        </NavLink>

        <div className="flex items-center gap-3">
          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm"
              aria-label="Install FundLens App"
            >
              📥 Install
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0d1117] border-t border-slate-200 dark:border-slate-800 bottom-nav-safe"
      >
        <div className="flex items-stretch">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              id={`mobile-nav-${toSlug(label)}`}
              aria-label={label}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                  )}
                  <span className="relative">
                    {icon}
                  </span>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

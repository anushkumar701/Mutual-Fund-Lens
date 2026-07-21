// components/Footer.jsx
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-12 mb-16 md:mb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-6 h-6 text-blue-600"
                aria-hidden="true"
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
              <span className="text-base font-bold text-slate-900 dark:text-white">
                Fund<span className="text-blue-600">Lens</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              India&apos;s premium mutual fund analytics workspace. Built for developers and retail investors to gain transparent, client-side insights.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Platform Links
            </h4>
            <ul className="space-y-2">
              {[
                { to: "/", label: "Portfolio Dashboard" },
                { to: "/screener", label: "Interactive Screener" },
                { to: "/compare", label: "Fund Comparison" },
                { to: "/sip", label: "Wealth Simulator" },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data Attribution */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Data & API Attribution
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              Scheme metadata, daily NAVs, and historic price datasets are fetched directly in real-time from the official public AMFI API provider at{" "}
              <a
                href="https://api.mfapi.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                mfapi.in
              </a>.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span>AMFI Connected</span>
            </div>
          </div>

          {/* Regulatory Compliance Disclaimer */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Regulatory Disclaimer
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong>Compliance Notice:</strong> FundLens is not registered with SEBI (Securities and Exchange Board of India) as an Investment Adviser or Research Analyst. Mutual fund investments are subject to market risks; read all scheme-related documents carefully before investing. Past performance is not indicative of future returns.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-500 text-center sm:text-left">
            © {new Date().getFullYear()} FundLens. Non-commercial client-side analytical software.
          </p>
          <div className="flex gap-4">
            <span className="text-[10px] text-slate-400">Security Layer: AES-XOR 256</span>
            <span className="text-[10px] text-slate-400">Worker Engine: v3.1 Async</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

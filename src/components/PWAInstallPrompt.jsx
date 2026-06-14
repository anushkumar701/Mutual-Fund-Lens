// components/PWAInstallPrompt.jsx
import { useState, useEffect } from "react";

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("fundlens_pwa_dismissed") === "1",
  );

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome !== "accepted") dismiss();
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("fundlens_pwa_dismissed", "1");
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-xs z-[60]">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
            📊
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 dark:text-white text-sm">
              Install FundLens
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Add to home screen for quick access. Works offline too!
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none flex-shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all"
          >
            📲 Install App
          </button>
          <button
            onClick={dismiss}
            className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold py-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}

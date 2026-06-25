// components/PWAUpdatePrompt.jsx
import { useState, useEffect } from "react";

export default function PWAUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener("sw-update-available", handleUpdate);
    return () => {
      window.removeEventListener("sw-update-available", handleUpdate);
    };
  }, []);

  const handleUpdateClick = async () => {
    setIsUpdating(true);
    try {
      // 1. Clear all caches
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      // 2. Unregister service workers so they are pulled fresh
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      // 3. Reload page from server
      window.location.reload(true);
    } catch (err) {
      console.error("Failed to clear cache and reload:", err);
      window.location.reload();
    }
  };

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:right-auto md:w-96 z-[9999] animate-slide-in-up"
      role="alert"
      aria-live="assertive"
    >
      <div className="bg-slate-950/95 dark:bg-slate-900/95 backdrop-blur-md border border-indigo-500/30 dark:border-indigo-500/20 text-white rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg shadow-inner flex-shrink-0 animate-bounce">
            ✨
          </div>
          <div>
            <h4 className="font-bold text-slate-100 text-sm">
              App Update Available!
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              A newer and faster version of FundLens is ready. Update now to get the latest performance upgrades and premium tools.
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3 mt-1">
          <button
            onClick={() => setUpdateAvailable(false)}
            disabled={isUpdating}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-50"
          >
            Later
          </button>
          <button
            onClick={handleUpdateClick}
            disabled={isUpdating}
            className="relative px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Updating...</span>
              </>
            ) : (
              <span>Update & Restart</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

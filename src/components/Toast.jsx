// components/Toast.jsx
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutIdsRef = useRef(new Map()); // id → timeoutId

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tid = timeoutIdsRef.current.get(id);
    if (tid) {
      clearTimeout(tid);
      timeoutIdsRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutIdsRef.current.delete(id);
    }, duration);
    timeoutIdsRef.current.set(id, timeoutId);
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      timeoutIdsRef.current.forEach((tid) => clearTimeout(tid));
      timeoutIdsRef.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div
        className="fixed bottom-24 md:bottom-6 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-in-right px-4 py-3 rounded-xl shadow-2xl text-sm font-medium pointer-events-auto flex items-center gap-2 min-w-[220px] max-w-[calc(100vw-2rem)] md:max-w-xs border ${
              toast.type === "success"
                ? "bg-emerald-600 text-white border-emerald-500"
                : toast.type === "error"
                  ? "bg-red-600 text-white border-red-500"
                  : toast.type === "warning"
                    ? "bg-amber-500 text-white border-amber-400"
                    : "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
            }`}
          >
            <span className="text-base flex-shrink-0" aria-hidden="true">
              {toast.type === "success" && "✓"}
              {toast.type === "error" && "✕"}
              {toast.type === "warning" && "⚠"}
              {toast.type === "info" && "ℹ"}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 ml-1 opacity-70 hover:opacity-100 transition-opacity text-xs font-bold leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

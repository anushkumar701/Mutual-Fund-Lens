// components/ThemeToggle.jsx
import { useState, useRef, useEffect } from "react";
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const themes = [
    { id: "system", label: "System (Auto)", icon: "🖥️", bg: "bg-gradient-to-r from-[#f0f4f8] to-[#0d1117]" },
    { id: "light", label: "Light Mode", icon: "☀️", bg: "bg-[#f0f4f8]" },
    { id: "dark", label: "Navy (Dark)", icon: "🌙", bg: "bg-[#0d1117]" },
    { id: "midnight", label: "Midnight Blue", icon: "🌌", bg: "bg-[#020617]" },
    { id: "bloomberg", label: "Terminal Black", icon: "⬛", bg: "bg-[#000000]" },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="theme-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select Theme"
        className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
      >
        {theme === "light" ? (
          <svg className="w-5 h-5 text-slate-600" aria-hidden="true" focusable="false" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-yellow-400" aria-hidden="true" focusable="false" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 animate-fade-in-up">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100 dark:border-slate-700/50">
            Premium Themes
          </div>
          <div className="flex flex-col py-1">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                  theme === t.id
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center ${t.bg}`}>
                  {theme === t.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />}
                </div>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// hooks/useTheme.js
import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

export function useTheme() {
  // theme can be "system", "light", "dark", "bloomberg", "midnight"
  const [theme, setTheme] = useLocalStorage("fundlens_theme", "system");

  useEffect(() => {
    const root = document.documentElement;
    
    // Resolve "system" to actual light/dark based on OS preference
    let resolved = theme;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      resolved = prefersDark ? "dark" : "light";
    }

    // Add "dark" class for any dark-based theme
    if (resolved === "dark" || resolved === "bloomberg" || resolved === "midnight") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Set data-theme attribute for premium theme overrides
    if (resolved === "bloomberg" || resolved === "midnight") {
      root.setAttribute("data-theme", resolved);
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      const root = document.documentElement;
      if (e.matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      root.removeAttribute("data-theme");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}

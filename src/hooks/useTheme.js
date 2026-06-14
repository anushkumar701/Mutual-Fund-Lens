// hooks/useTheme.js
import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

export function useTheme() {
  // theme can be "light", "dark", "bloomberg", "midnight"
  const [theme, setTheme] = useLocalStorage("fundlens_theme", "light");

  useEffect(() => {
    const root = document.documentElement;
    
    // Add "dark" class for any dark-based theme
    if (theme === "dark" || theme === "bloomberg" || theme === "midnight") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Set data-theme attribute for premium theme overrides
    if (theme === "bloomberg" || theme === "midnight") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  return { theme, setTheme };
}

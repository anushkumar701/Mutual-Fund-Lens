// hooks/useLocalStorage.js
import { useState, useEffect, useCallback } from "react";

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Sync across browser tabs (storage event only fires for OTHER tabs)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch {
          // Ignore invalid JSON from other tabs
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  const setValue = useCallback(
    (value) => {
      try {
        // Read current persisted value to resolve functional updates correctly
        let current = initialValue;
        try {
          current =
            JSON.parse(localStorage.getItem(key) ?? "null") ?? initialValue;
        } catch {
          /* ignore */
        }
        const valueToStore = value instanceof Function ? value(current) : value;
        // Write to storage FIRST (synchronous) — NOT inside the state updater
        // Prevents React 18 Strict Mode double-invocation from double-writing storage
        localStorage.setItem(key, JSON.stringify(valueToStore));
        setStoredValue(valueToStore);
      } catch {
        // Storage quota exceeded / private mode — fall back to in-memory state only
        setStoredValue((current) =>
          value instanceof Function ? value(current) : value,
        );
      }
    },
    [key, initialValue],
  );

  return [storedValue, setValue];
}

// hooks/useLocalStorage.js
import { useState, useEffect, useCallback } from "react";

const OBFUSCATION_KEY = "fundlens_secure_salt_2026";
const secureKeys = ["fundlens_portfolio", "fundlens_portfolio_notify", "fundlens_portfolio_total_value"];

function encrypt(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function decrypt(ciphertext) {
  try {
    const raw = decodeURIComponent(escape(atob(ciphertext)));
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    return ciphertext; // Fallback to raw text if not encrypted
  }
}

function getStorageItem(key) {
  const val = localStorage.getItem(key);
  if (!val) return null;
  if (secureKeys.includes(key)) {
    try {
      const decrypted = decrypt(val);
      JSON.parse(decrypted); // Verify if it is valid JSON
      return decrypted;
    } catch {
      return val; // Fallback to raw text
    }
  }
  return val;
}

function setStorageItem(key, val) {
  if (secureKeys.includes(key)) {
    localStorage.setItem(key, encrypt(val));
  } else {
    localStorage.setItem(key, val);
  }
}

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = getStorageItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Sync across browser tabs (storage event only fires for OTHER tabs)
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== key) return;
      try {
        let valToParse = e.newValue;
        if (valToParse !== null && secureKeys.includes(key)) {
          try {
            const decrypted = decrypt(valToParse);
            JSON.parse(decrypted);
            valToParse = decrypted;
          } catch {
            // fallback
          }
        }
        const parsed = valToParse !== null ? JSON.parse(valToParse) : initialValue;
        setStoredValue(parsed);
      } catch {
        // Ignore invalid JSON from other tabs
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, initialValue]);

  const setValue = useCallback(
    (value) => {
      try {
        let current = initialValue;
        try {
          const item = getStorageItem(key);
          current = JSON.parse(item ?? "null") ?? initialValue;
        } catch {
          /* ignore */
        }
        const valueToStore = value instanceof Function ? value(current) : value;
        setStorageItem(key, JSON.stringify(valueToStore));
        setStoredValue(valueToStore);
      } catch {
        setStoredValue((current) =>
          value instanceof Function ? value(current) : value,
        );
      }
    },
    [key, initialValue],
  );

  return [storedValue, setValue];
}

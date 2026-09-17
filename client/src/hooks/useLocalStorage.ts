import { useState, useEffect, useCallback } from "react";

/**
 * BidRidge — useLocalStorage hook
 * Persists state to localStorage so data survives page refreshes.
 *
 * Key-change behaviour: when `key` changes (e.g. switching projects),
 * the hook immediately re-reads the new key from localStorage so the
 * component gets the correct persisted value for the new project rather
 * than keeping the previous project's in-memory state.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Re-read from localStorage whenever the key changes (e.g. switching projects).
  // Without this, the hook keeps the previous project's in-memory value even though
  // the key has changed, causing stale page numbers, zoom levels, and PDF hashes.
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      setStoredValue(item ? (JSON.parse(item) as T) : initialValue);
    } catch {
      setStoredValue(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const next =
          typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* quota exceeded — silently ignore */
        }
        return next;
      });
    },
    [key]
  );

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  return [storedValue, setValue] as const;
}

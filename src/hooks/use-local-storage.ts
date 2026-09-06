"use client";

import { useCallback, useEffect, useState } from "react";

type SetState<T> = (value: T | ((prev: T) => T)) => void;

export function useLocalStorage<T>(key: string, initialValue: T): [T, SetState<T>, () => void, "loading" | "saved" | "unavailable"] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saved" | "unavailable">("loading");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore corrupt JSON
    } finally {
      setHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    // Do not overwrite a saved draft with defaults during the initial render.
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unavailable");
    }
  }, [key, value, hydrated]);

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, remove, saveStatus];
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SetState<T> = (value: T | ((prev: T) => T)) => void;

export function useLocalStorage<T>(key: string, initialValue: T): [T, SetState<T>, () => void] {
  const [value, setValue] = useState<T>(initialValue);
  const isHydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore corrupt JSON
    } finally {
      isHydrated.current = true;
    }
  }, [key]);

  useEffect(() => {
    if (!isHydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded — silently drop
    }
  }, [key, value]);

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, remove];
}

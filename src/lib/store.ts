import { useEffect, useState } from 'react';

/** useState that survives reloads via localStorage (fails soft if storage is blocked). */
export function useStored<T>(key: string, initial: T, revive?: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (revive) return revive(parsed);
        if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) return parsed as T;
        return { ...initialIfObject(initial), ...parsed } as T;
      }
    } catch {
      /* ignore */
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

// Merge stored objects over defaults so new settings fields get defaults; arrays pass through.
function initialIfObject<T>(v: T) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

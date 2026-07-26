import { useEffect, useState } from "react";

/**
 * Returns `value` after `delay` ms of inactivity. Useful for debouncing
 * search inputs before firing server-side queries.
 */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

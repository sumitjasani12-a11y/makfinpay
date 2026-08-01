// Shared filter utilities for Admin Recharges & Transactions pages.
// Keeps the same date pill logic in one place.

export const DATE_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom", label: "Custom" },
];

export function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// returns [startMs, endMs) or [null, null] for lifetime / incomplete custom
export function rangeWindow(key, from, to) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const next = new Date(start); next.setDate(next.getDate() + 1);
  if (key === "today") return [start.getTime(), next.getTime()];
  if (key === "yesterday") {
    const y = new Date(start); y.setDate(y.getDate() - 1);
    return [y.getTime(), start.getTime()];
  }
  if (key === "last7") {
    const s = new Date(start); s.setDate(s.getDate() - 7);
    return [s.getTime(), next.getTime()];
  }
  if (key === "last30") {
    const s = new Date(start); s.setDate(s.getDate() - 30);
    return [s.getTime(), next.getTime()];
  }
  if (key === "custom") {
    if (!from || !to) return [null, null];
    const f = new Date(from); f.setHours(0, 0, 0, 0);
    const t = new Date(to); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 1);
    return [f.getTime(), t.getTime()];
  }
  return [null, null];
}

// Same as rangeWindow but returns { from_ts, to_ts } as ISO strings for server-side filters.
// Both null when the range is lifetime / incomplete-custom.
export function rangeWindowIso(key, from, to) {
  const [s, e] = rangeWindow(key, from, to);
  if (s == null || e == null) return { from_ts: null, to_ts: null };
  return { from_ts: new Date(s).toISOString(), to_ts: new Date(e).toISOString() };
}

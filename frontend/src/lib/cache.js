// -----------------------------------------------------------------------------
// Ultra-Fast In-Memory SWR Data Cache for Instant 0ms Page Loading
// -----------------------------------------------------------------------------
const memoryCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds freshness window

export const getCachedData = (key) => {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
  return { data: cached.data, isExpired };
};

export const setCachedData = (key, data) => {
  memoryCache.set(key, { data, timestamp: Date.now() });
};

export const clearCache = (keyPattern = null) => {
  if (!keyPattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(keyPattern)) {
      memoryCache.delete(key);
    }
  }
};

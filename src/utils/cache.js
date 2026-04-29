'use strict';

/**
 * @fileoverview CivicMind response caching utilities.
 *
 * Provides a cache-aside pattern wrapper around `node-cache` with separate
 * cache instances for Gemini AI responses and Google Civic Info API responses.
 *
 * Cache TTLs are configurable via environment variables:
 *   - GEMINI_CACHE_TTL  (default: 300s = 5 min)
 *   - CIVIC_CACHE_TTL   (default: 3600s = 1 hour)
 *
 * @module utils/cache
 */

const NodeCache = require('node-cache');

// ─── CACHE INSTANCES ──────────────────────────────────────────────────────────

/**
 * Cache for Gemini AI responses.
 * Short TTL because AI responses may vary and context changes.
 * Identical queries within the TTL window are served from cache.
 *
 * @type {NodeCache}
 */
const geminiCache = new NodeCache({
  stdTTL: parseInt(process.env.GEMINI_CACHE_TTL, 10) || 300, // 5 minutes
  checkperiod: 60,
  useClones: false,
});

/**
 * Cache for Google Civic Info API responses.
 * Longer TTL because election data doesn't change minute-to-minute.
 *
 * @type {NodeCache}
 */
const civicCache = new NodeCache({
  stdTTL: parseInt(process.env.CIVIC_CACHE_TTL, 10) || 3600, // 1 hour
  checkperiod: 120,
  useClones: false,
});

// ─── CACHE HELPERS ────────────────────────────────────────────────────────────

/**
 * Cache-aside pattern: returns cached value if present, otherwise calls
 * `fetchFn`, stores the result, and returns it.
 *
 * @template T
 * @param {NodeCache} cache - The NodeCache instance to use
 * @param {string} key - Cache key (should be unique and deterministic)
 * @param {() => Promise<T>} fetchFn - Async function that fetches the real data
 * @returns {Promise<T>} The cached or freshly fetched value
 * @throws Will re-throw any error from `fetchFn`
 * @example
 * const data = await getOrFetch(civicCache, 'elections:list', () =>
 *   fetch('https://...elections').then(r => r.json())
 * );
 */
async function getOrFetch(cache, key, fetchFn) {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const fresh = await fetchFn();
  cache.set(key, fresh);
  return fresh;
}

/**
 * Invalidates a specific key in the given cache.
 *
 * @param {NodeCache} cache - The NodeCache instance
 * @param {string} key - Key to invalidate
 * @returns {boolean} True if the key existed and was deleted
 */
function invalidate(cache, key) {
  return cache.del(key) > 0;
}

/**
 * Returns cache statistics for monitoring/debugging.
 *
 * @param {NodeCache} cache - The NodeCache instance
 * @returns {{ keys: number, hits: number, misses: number }} Cache stats
 */
function getStats(cache) {
  const stats = cache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
  };
}

module.exports = {
  geminiCache,
  civicCache,
  getOrFetch,
  invalidate,
  getStats,
};

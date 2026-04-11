/**
 * Search cache for profile search page.
 * Caches search results by query with TTL to avoid repeated API calls.
 * Caches recent search terms for autocomplete.
 */

const CACHE_KEY_PREFIX = 'aep-profile-search-';
const RECENT_TERMS_KEY = 'aep-profile-viewer-recent-search-terms';
const MAX_RECENT_TERMS = 15;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Get cached search results for query. Returns null if miss or expired. */
function getCachedSearchResults(query) {
  const key = CACHE_KEY_PREFIX + encodeURIComponent((query || '').toLowerCase().trim());
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { profiles, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return profiles;
  } catch {
    return null;
  }
}

/** Store search results in cache. */
function setCachedSearchResults(query, profiles) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return;
  const key = CACHE_KEY_PREFIX + encodeURIComponent(q);
  try {
    sessionStorage.setItem(key, JSON.stringify({
      profiles: profiles || [],
      timestamp: Date.now(),
    }));
  } catch {
    // quota exceeded, ignore
  }
}

/** Get recent search terms for autocomplete. */
function getRecentSearchTerms() {
  try {
    const raw = localStorage.getItem(RECENT_TERMS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string' && e.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/** Add search term to recent list. */
function addRecentSearchTerm(term) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return;
  let list = getRecentSearchTerms();
  list = list.filter((x) => x !== t);
  list.unshift(t);
  list = list.slice(0, MAX_RECENT_TERMS);
  try {
    localStorage.setItem(RECENT_TERMS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.AepLabSandboxSync && typeof window.AepLabSandboxSync.notifyDirty === 'function') {
    window.AepLabSandboxSync.notifyDirty();
  }
}

/**
 * Thin client for the Google Maps Static API — renders a marker on a map
 * as a PNG, returned as raw bytes for embedding directly in an MCP image
 * content block (not just a URL, since a URL would carry the API key in
 * the query string).
 */

const STATIC_MAP_ORIGIN = 'https://maps.googleapis.com/maps/api/staticmap';
const EMBED_ORIGIN = 'https://www.google.com/maps/embed/v1/view';
const DEFAULT_SIZE = '600x400';
const DEFAULT_ZOOM = 11;
const FETCH_TIMEOUT_MS = 15_000;

function embedApiKey() {
  return String(process.env.GOOGLE_MAPS_EMBED_API_KEY || '').trim();
}

/**
 * The Maps Embed API key is designed to be exposed publicly in the iframe
 * `src` it produces — unlike GOOGLE_MAPS_API_KEY above, which stays
 * server-side only. Keep them as two separate, narrowly-scoped keys so a
 * key that ends up visible in a client's HTML never carries Static
 * Maps/Geocoding privileges.
 *
 * @param {{ lat: number, lon: number, zoom?: number }} params
 * @returns {string | null} an authorized iframe src, or null if unconfigured
 */
export function buildEmbedMapUrl({ lat, lon, zoom }) {
  const key = embedApiKey();
  if (!key || lat == null || lon == null) return null;
  const url = new URL(EMBED_ORIGIN);
  url.searchParams.set('key', key);
  url.searchParams.set('center', `${lat},${lon}`);
  url.searchParams.set('zoom', String(zoom || DEFAULT_ZOOM));
  return url.toString();
}

function apiKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

export function isMapsConfigured() {
  return apiKey().length > 0;
}

/**
 * @param {{ lat: number, lon: number, label?: string, zoom?: number, size?: string }} params
 * @returns {Promise<{ ok: boolean, error?: string, status?: number, base64?: string, mimeType?: string }>}
 */
export async function fetchStaticMapPng({ lat, lon, label, zoom, size }) {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' };
  if (lat == null || lon == null) return { ok: false, status: 0, error: 'Provide both lat and lon.' };

  const url = new URL(STATIC_MAP_ORIGIN);
  url.searchParams.set('center', `${lat},${lon}`);
  url.searchParams.set('zoom', String(zoom || DEFAULT_ZOOM));
  url.searchParams.set('size', size || DEFAULT_SIZE);
  const marker = label ? `color:red|label:${String(label).slice(0, 1).toUpperCase()}|${lat},${lon}` : `color:red|${lat},${lon}`;
  url.searchParams.set('markers', marker);
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? `Static Maps timeout after ${FETCH_TIMEOUT_MS}ms` : String(err.message || err);
    return { ok: false, status: 0, error: msg };
  }
  clearTimeout(timer);

  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || !contentType.startsWith('image/')) {
    // Static Maps returns plain-text error bodies (e.g. "You must use an API key...").
    const text = await response.text().catch(() => '');
    return { ok: false, status: response.status, error: text.slice(0, 500) || `HTTP ${response.status}` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { ok: true, status: response.status, base64: buffer.toString('base64'), mimeType: contentType };
}

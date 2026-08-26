/**
 * Thin HTTP client for the OpenWeatherMap API — reuses labApiClient's
 * retry/backoff/timeout handling against a third-party origin instead of
 * the Lab API. Key is passed as a query param (OpenWeatherMap's own
 * convention); callers must not surface the raw request URL back to an
 * MCP client, since it would leak the key.
 */

import { labApiRequest } from './labApiClient.mjs';

const OPENWEATHER_ORIGIN = 'https://api.openweathermap.org';

function apiKey() {
  return String(process.env.OPENWEATHER_API_KEY || '').trim();
}

export function isWeatherConfigured() {
  return apiKey().length > 0;
}

function locationQuery({ city, lat, lon }) {
  if (lat != null && lon != null) return { lat, lon };
  if (city) return { q: city };
  return null;
}

/**
 * @param {string} path - OpenWeatherMap path, e.g. /data/2.5/weather
 * @param {{ city?: string, lat?: number, lon?: number, units?: string }} params
 */
async function weatherRequest(path, { city, lat, lon, units }) {
  const key = apiKey();
  if (!key) {
    return { ok: false, status: 0, url: null, error: 'OPENWEATHER_API_KEY is not configured on the server.', data: null };
  }
  const location = locationQuery({ city, lat, lon });
  if (!location) {
    return { ok: false, status: 0, url: null, error: 'Provide either city, or both lat and lon.', data: null };
  }
  return labApiRequest(path, {
    origin: OPENWEATHER_ORIGIN,
    query: { ...location, units: units || 'metric', appid: key },
  });
}

export async function getCurrentWeather(params) {
  return weatherRequest('/data/2.5/weather', params);
}

export async function getWeatherForecast(params) {
  return weatherRequest('/data/2.5/forecast', params);
}

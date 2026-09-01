import * as z from 'zod';
import { getCurrentWeather, getWeatherForecast } from '../weatherApiClient.mjs';
import { fetchStaticMapPng } from '../googleMapsClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * Deliberately does not use fromLabApi()'s error shape here: that helper
 * echoes the failed request URL back to the caller, and OpenWeatherMap
 * takes its API key as a query param, so the URL would leak the key.
 */
function toWeatherResult(apiResult) {
  if (!apiResult.ok) {
    return toolError(apiResult.error || 'OpenWeatherMap request failed', {
      status: apiResult.status,
      response: apiResult.data,
    });
  }
  return jsonResult({ ok: true, weather: apiResult.data });
}

const locationSchema = {
  city: z.string().optional().describe('City name, optionally "City,CountryCode" (e.g. "London,GB"). Provide this or lat/lon.'),
  lat: z.number().optional().describe('Latitude. Provide together with lon instead of city.'),
  lon: z.number().optional().describe('Longitude. Provide together with lat instead of city.'),
  units: z.enum(['standard', 'metric', 'imperial']).optional().describe('Unit system (default metric).'),
};

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerWeatherTools(mcpServer) {
  mcpServer.registerTool(
    'lab_weather_current',
    {
      title: 'Get current weather for a location',
      description:
        'Current conditions from OpenWeatherMap for a city name or lat/lon coordinates — useful for demo scenarios '
        + 'that condition on live weather (e.g. travel disruption or retail footfall journeys).',
      inputSchema: locationSchema,
    },
    async ({ city, lat, lon, units }) => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_weather_current' });
      const apiResult = await getCurrentWeather({ city, lat, lon, units });
      return toWeatherResult(apiResult);
    },
  );

  mcpServer.registerTool(
    'lab_weather_forecast',
    {
      title: 'Get a 5-day / 3-hour weather forecast for a location',
      description: 'Five-day forecast in 3-hour steps from OpenWeatherMap for a city name or lat/lon coordinates.',
      inputSchema: locationSchema,
    },
    async ({ city, lat, lon, units }) => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_weather_forecast' });
      const apiResult = await getWeatherForecast({ city, lat, lon, units });
      return toWeatherResult(apiResult);
    },
  );

  mcpServer.registerTool(
    'lab_weather_map',
    {
      title: 'Get current weather for a location and render it on a map',
      description:
        'Looks up current weather from OpenWeatherMap for a city name or lat/lon coordinates, then renders a Google '
        + 'Static Maps image with a marker at that location. Returns the weather summary as text plus an embedded '
        + 'map image — useful when a demo scenario should visually show where a weather-conditioned event occurred.',
      inputSchema: {
        ...locationSchema,
        zoom: z.number().int().min(1).max(20).optional().describe('Map zoom level, 1 (world) to 20 (building), default 11.'),
      },
    },
    async ({ city, lat, lon, units, zoom }) => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_weather_map' });
      const weatherResult = await getCurrentWeather({ city, lat, lon, units });
      if (!weatherResult.ok) return toWeatherResult(weatherResult);

      const coordLat = weatherResult.data?.coord?.lat ?? lat;
      const coordLon = weatherResult.data?.coord?.lon ?? lon;
      const placeName = weatherResult.data?.name || city;

      const mapResult = await fetchStaticMapPng({ lat: coordLat, lon: coordLon, label: placeName, zoom });
      if (!mapResult.ok) {
        return toolError(`Weather lookup succeeded, but the map render failed: ${mapResult.error}`, {
          status: mapResult.status,
          weather: weatherResult.data,
        });
      }

      return {
        content: [
          { type: 'text', text: JSON.stringify({ ok: true, weather: weatherResult.data }, null, 2) },
          { type: 'image', data: mapResult.base64, mimeType: mapResult.mimeType },
        ],
      };
    },
  );
}

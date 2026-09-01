import * as z from 'zod';
import { getCurrentWeather, getWeatherForecast } from '../weatherApiClient.mjs';
import { fetchStaticMapPng } from '../googleMapsClient.mjs';
import { uploadWeatherMapImage } from '../weatherMapStorage.mjs';
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
      title: 'Get current weather for a location (text only, no map)',
      description:
        'Current conditions from OpenWeatherMap for a city name or lat/lon coordinates — useful for demo scenarios '
        + 'that condition on live weather (e.g. travel disruption or retail footfall journeys). Returns text data only '
        + '— no map or image. If the request asks to see, show, plot, render, or visualize the weather on a map, call '
        + 'lab_weather_map instead.',
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
      title: 'Get current weather for a location and show it on a map',
      description:
        'The ONLY weather tool that produces a map — call this, not lab_weather_current, whenever a request asks to '
        + 'see, show, plot, render, view, or visualize weather on a map. Looks up current weather from OpenWeatherMap '
        + 'for a city name or lat/lon coordinates, then renders a Google Static Maps image with a marker at that '
        + 'location. The response includes, in order of reliability: (1) a plain "Open in Google Maps" link — a real, '
        + 'fully interactive Google Maps page the colleague can click, pan, zoom, and explore, guaranteed to render '
        + 'in any MCP host since it is just a hyperlink; (2) a Markdown image link to a static rendered map; (3) an '
        + 'inline MCP image content block. Always surface the Google Maps link — it is the most dependable way to '
        + 'actually show the location, since some hosts do not render inline images or Markdown image links at all.',
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

      const upload = await uploadWeatherMapImage({ base64: mapResult.base64, mimeType: mapResult.mimeType });
      const displayName = placeName || `${coordLat},${coordLon}`;
      const googleMapsUrl = `https://www.google.com/maps?q=${coordLat},${coordLon}`;

      const textPayload = {
        ok: true,
        weather: weatherResult.data,
        google_maps_url: googleMapsUrl,
        map_image_url: upload.ok ? upload.url : null,
        map_image_error: upload.ok ? null : upload.error,
      };
      const imageMarkdown = upload.ok ? `![Map of ${displayName}](${upload.url})\n\n` : '';
      const mapsLink = `[Open ${displayName} in Google Maps](${googleMapsUrl})\n\n`;

      return {
        content: [
          { type: 'text', text: `${mapsLink}${imageMarkdown}${JSON.stringify(textPayload, null, 2)}` },
          { type: 'image', data: mapResult.base64, mimeType: mapResult.mimeType },
        ],
      };
    },
  );
}

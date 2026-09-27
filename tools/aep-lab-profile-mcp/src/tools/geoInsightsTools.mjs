import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkGeoHotspotsRate, reserveGeoSeedRates } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  getCurrentWeather,
} from '../weatherApiClient.mjs';
import {
  getAudienceGeoHotspots,
  listEventTargets,
  sendProfileEvent,
} from '../labApiClient.mjs';
import { buildGeoSeedPlan, geoJsonResult, nearestSeededNeighborhood, shapeGeoHotspotsResponse } from '../framework/geoInsights.mjs';
import { planDualStreamGenerate, executeGeneratePlan } from '../framework/dualStreamGenerate.mjs';
import { buildPersonaAttributes } from '../personaBuilder.mjs';
import { buildIndustryEventPayload } from '../framework/industryEventPayload.mjs';
import { validateEventTarget } from '../framework/eventIdentity.mjs';
import { resolveProfileEmailForGenerate } from './generationPrefs.mjs';
import { toolError } from './helpers.mjs';

const locationSchema = {
  city: z.string().trim().min(1).optional().describe('City name to geocode, such as "Riyadh" or "Dubai".'),
  lat: z.number().min(-90).max(90).optional().describe('Latitude; provide together with lon instead of city.'),
  lon: z.number().min(-180).max(180).optional().describe('Longitude; provide together with lat instead of city.'),
};

function resolveHotspotCenter({ city, lat, lon }) {
  if (city && (lat != null || lon != null)) {
    return { ok: false, error: 'Provide city or lat/lon, not both.' };
  }
  if (!city && (lat == null || lon == null)) {
    return { ok: false, error: 'Provide city or both lat and lon.' };
  }
  if (city) return { ok: true, city };
  const label = nearestSeededNeighborhood({ lat, lon });
  return { ok: true, center: { lat, lon, label } };
}

function rowsFromQueryResult(data) {
  return Array.isArray(data?.rows) ? data.rows : [];
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGeoInsightsTools(mcpServer) {
  mcpServer.registerTool(
    'lab_audience_geo_hotspots',
    {
      title: 'Find governed audience geo-hotspots',
      description:
        'Read-only aggregate of retail product-view profiles from AEP Query Service, filtered by interest, time window, '
        + 'and radius. Cells below k=10 are suppressed; identities and raw events are never returned. Provide a city or '
        + 'lat/lon center. If the result is empty, seed demo data with lab_seed_geo_demo.',
      inputSchema: {
        ...locationSchema,
        radius_km: z.number().min(1).max(50).default(10).describe('Search radius in kilometres (1–50, default 10).'),
        window_hours: z.number().int().min(1).max(168).default(24).describe('Lookback window in hours (1–168, default 24).'),
        interest: z.string().trim().min(1).max(200).describe('Product name or category text to match, e.g. "camping gear".'),
        sandbox: z.string().trim().min(1).describe('AEP sandbox name (MCP allowlist).'),
        cell_km: z.number().min(0.5).max(5).default(1).describe('Grid cell width in kilometres (0.5–5, default 1).'),
      },
    },
    async ({ city, lat, lon, radius_km, window_hours, interest, sandbox, cell_km }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });

      const rate = checkGeoHotspotsRate(keyId);
      if (!rate.ok) return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });

      const location = resolveHotspotCenter({ city, lat, lon });
      if (!location.ok) return toolError(location.error);

      let center = location.center;
      if (location.city) {
        const geocoded = await getCurrentWeather({ city: location.city, units: 'metric' });
        if (!geocoded.ok) {
          return toolError(`Could not geocode "${location.city}" for the geo-hotspot query.`, {
            status: geocoded.status,
            error: geocoded.error,
          });
        }
        const resolvedLat = Number(geocoded.data?.coord?.lat);
        const resolvedLon = Number(geocoded.data?.coord?.lon);
        if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLon)) {
          return toolError('The city lookup did not return valid coordinates.');
        }
        center = {
          lat: resolvedLat,
          lon: resolvedLon,
          label: String(geocoded.data?.name || location.city),
        };
      }

      const apiResult = await getAudienceGeoHotspots({
        sandbox: allowed.sandbox,
        center: { lat: center.lat, lon: center.lon },
        radius_km,
        window_hours,
        interest,
        cell_km,
      });
      if (!apiResult.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_audience_geo_hotspots',
          sandbox: allowed.sandbox,
          center: { lat: center.lat, lon: center.lon },
          radius_km,
          window_hours,
          interest,
          total_profiles: null,
          suppressed_profiles: null,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(apiResult.error || 'AEP Query Service geo-hotspot query failed.', {
          status: apiResult.status,
        });
      }

      const rows = rowsFromQueryResult(apiResult.data);
      const result = shapeGeoHotspotsResponse({
        center,
        radius_km,
        window_hours,
        interest,
        total_profiles: rows[0]?.total_profiles ?? 0,
        suppressed_profiles: rows[0]?.suppressed_profiles ?? 0,
        rows,
        sandbox: allowed.sandbox,
        generated_at: new Date().toISOString(),
      });
      writeAuditLog({
        keyId,
        tool: 'lab_audience_geo_hotspots',
        sandbox: allowed.sandbox,
        center: { lat: center.lat, lon: center.lon },
        radius_km,
        window_hours,
        interest,
        total_profiles: result.total_profiles,
        suppressed_profiles: result.suppressed_profiles,
        result: 'ok',
        durationMs: Date.now() - started,
      });
      return geoJsonResult(result);
    },
  );

  mcpServer.registerTool(
    'lab_seed_geo_demo',
    {
      title: 'Seed a governed geo-audience demo',
      description:
        'Mutation: creates test retail profiles and commerce.productViews events with realistic geo clusters around '
        + 'Riyadh or Dubai neighborhoods. Uses the current sandbox generation preferences and event target; maximum '
        + '30 profiles per call to stay within the existing per-key generation and event-send limits. The default '
        + 'batch spreads profiles across three neighborhood cells to make the k=10 threshold demonstrable. Query Service '
        + 'reflects data-lake ingestion after a delay, typically several minutes and variable by dataset/backlog.',
      inputSchema: {
        city: z.string().trim().min(1).describe('Supported seed city: Riyadh or Dubai.'),
        count: z.number().int().min(1).max(30).default(30).describe('Number of test profiles and product-view events (1–30, default 30).'),
        interest: z.string().trim().min(1).max(120).default('camping gear').describe('Retail product category and event interest.'),
        sandbox: z.string().trim().min(1).describe('AEP sandbox name (MCP allowlist).'),
      },
    },
    async ({ city, count, interest, sandbox }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });

      let plan;
      try {
        plan = buildGeoSeedPlan({ city, count, interest });
      } catch (error) {
        return toolError(error.message);
      }

      const targetsResult = await listEventTargets({ sandbox: allowed.sandbox });
      const targets = targetsResult.ok && Array.isArray(targetsResult.data?.targets)
        ? targetsResult.data.targets
        : [];
      const targetCheck = validateEventTarget({ targets });
      if (!targetCheck.ok) {
        return toolError(targetCheck.error, {
          targets_list_error: targetsResult.ok ? undefined : targetsResult.error,
          hint: 'Configure the Event Tool target for this sandbox before seeding geo demo data.',
        });
      }

      const rate = reserveGeoSeedRates(keyId, count);
      if (!rate.ok) return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });

      let generated = 0;
      let sent = 0;
      let lastError = '';
      try {
        for (const [index, seed] of plan.entries()) {
          const emailPlan = await resolveProfileEmailForGenerate({
            sandbox: allowed.sandbox,
            use_stored_prefs: true,
          });
          if (!emailPlan.ok) {
            lastError = emailPlan.error || 'Generation preferences are not configured.';
            break;
          }
          const attributes = buildPersonaAttributes('retail', emailPlan.email);
          const profilePlan = planDualStreamGenerate({
            industry: 'retail',
            attributes,
            email: emailPlan.email,
          });
          const profileResult = await executeGeneratePlan({
            email: emailPlan.email,
            sandbox: allowed.sandbox,
            plan: profilePlan,
            test_profile: true,
          });
          if (!profileResult.ok) {
            lastError = profileResult.error || 'AEP test profile generation failed.';
            break;
          }
          generated += 1;

          const ecid = String(
            profileResult.ecid
              || profileResult.data?.ecid
              || profileResult.data?.identification?.core?.ecid
              || '',
          ).trim();
          if (!/^\d{10,}$/.test(ecid)) {
            lastError = 'AEP profile generation succeeded without returning an ECID; the geo event was not sent.';
            break;
          }
          const richEvent = buildIndustryEventPayload({
            industry: 'retail',
            industry_fields: {
              productName: seed.interest,
              productCategory: seed.interest,
              sku: `GEO-DEMO-${index + 1}`,
            },
          });
          if (!richEvent.ok) {
            lastError = richEvent.error;
            break;
          }
          const eventResult = await sendProfileEvent({
            sandbox: allowed.sandbox,
            email: emailPlan.email,
            ecid,
            target_id: targetCheck.requested_id,
            event_type: 'commerce.productViews',
            channel: 'web',
            timestamp: seed.timestamp,
            public: richEvent.public,
            xdm_style: 'full',
            geo_lat: seed.lat,
            geo_lon: seed.lon,
          });
          if (!eventResult.ok) {
            lastError = eventResult.error || 'AEP product-view event send failed.';
            break;
          }
          sent += 1;
        }
      } catch (error) {
        lastError = String(error?.message || error);
      }

      const complete = generated === count && sent === count;
      writeAuditLog({
        keyId,
        tool: 'lab_seed_geo_demo',
        sandbox: allowed.sandbox,
        city: plan[0]?.neighborhood ? String(city) : '',
        interest,
        count_requested: count,
        profiles_generated: generated,
        events_sent: sent,
        result: complete ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      const payload = {
        ok: complete,
        kind: 'geo_demo_seed',
        city: String(city),
        interest,
        sandbox: allowed.sandbox,
        count_requested: count,
        profiles_generated: generated,
        events_sent: sent,
        source: 'aep-event-generator',
        ingestion_note:
          'Query Service reflects data-lake ingestion after a delay; allow several minutes, with actual timing varying by dataset and backlog.',
        generated_at: new Date().toISOString(),
        ...(lastError ? { error: lastError } : {}),
      };
      if (!complete) {
        return {
          ...geoJsonResult(payload),
          isError: true,
        };
      }
      return geoJsonResult(payload);
    },
  );
}

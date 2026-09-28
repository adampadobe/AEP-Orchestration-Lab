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
import {
  GEO_INTEREST_PATTERN,
  GEO_INTEREST_RULE,
  buildGeoSeedPlan,
  geoHotspotsFailureHint,
  geoJsonResult,
  geoSeedEventPlace,
  geoSeedPlaceAttributes,
  isGeoDataUnavailable,
  nearestSeededNeighborhood,
  resolveGeoCityPreset,
  runGeoSeedBatch,
  shapeGeoHotspotsResponse,
  shapeGeoHotspotsUnavailableResponse,
} from '../framework/geoInsights.mjs';
import { planDualStreamGenerate, executeGeneratePlan } from '../framework/dualStreamGenerate.mjs';
import { buildPersonaAttributes, mergePersonaAttributes } from '../personaBuilder.mjs';
import { buildIndustryEventPayload } from '../framework/industryEventPayload.mjs';
import { validateEventTarget } from '../framework/eventIdentity.mjs';
import { applyStoredPrefsMobileToAttributes, resolveProfileEmailForGenerate } from './generationPrefs.mjs';
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

function seedClusters(plan) {
  const byPoint = new Map();
  for (const seed of plan) {
    const key = `${seed.lat},${seed.lon}`;
    const entry = byPoint.get(key) || { lat: seed.lat, lon: seed.lon, neighborhood: seed.neighborhood || '', profiles: 0 };
    entry.profiles += 1;
    byPoint.set(key, entry);
  }
  return [...byPoint.values()];
}

/** Catalog centre for a city when live geocoding is unavailable. */
function catalogCenter(city) {
  const preset = resolveGeoCityPreset(city);
  return preset ? { lat: preset.center.lat, lon: preset.center.lon, label: preset.place.city } : null;
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
        'Read-only aggregate of profiles that viewed a matching retail product in the time window, plotted at '
        + 'each profile\'s last-known place (profilePlaceContext) within the radius. The interest must exactly '
        + 'match a viewed product name or category (case-insensitive). Cells below k=10 are suppressed; identities '
        + 'and raw events are never returned. Provide a city or lat/lon center. If data_status is "unavailable", '
        + 'report that no geo audience data is available (not a zero count) and do not seed. If data_status is '
        + '"available" and the result is empty, seed demo data with lab_seed_geo_demo.',
      inputSchema: {
        ...locationSchema,
        radius_km: z.number().min(1).max(50).default(10).describe('Search radius in kilometres (1–50, default 10).'),
        window_hours: z.number().int().min(1).max(168).default(24).describe('Lookback window in hours (1–168, default 24).'),
        interest: z.string().trim().regex(GEO_INTEREST_PATTERN, GEO_INTEREST_RULE)
          .describe(`Product name or category text to match, e.g. "camping gear". ${GEO_INTEREST_RULE}`),
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
        const resolvedLat = Number(geocoded.data?.coord?.lat);
        const resolvedLon = Number(geocoded.data?.coord?.lon);
        if (geocoded.ok && Number.isFinite(resolvedLat) && Number.isFinite(resolvedLon)) {
          center = {
            lat: resolvedLat,
            lon: resolvedLon,
            label: String(geocoded.data?.name || location.city),
          };
        } else {
          center = catalogCenter(location.city);
          if (!center) {
            return toolError(
              geocoded.ok
                ? 'The city lookup did not return valid coordinates.'
                : `Could not geocode "${location.city}" for the geo-hotspot query.`,
              geocoded.ok ? undefined : { status: geocoded.status, error: geocoded.error },
            );
          }
        }
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
        return toolError(apiResult.error || 'Geo-hotspot aggregation failed.', {
          status: apiResult.status,
          ...(geoHotspotsFailureHint(apiResult) ? { hint: geoHotspotsFailureHint(apiResult) } : {}),
        });
      }

      if (isGeoDataUnavailable(apiResult.data)) {
        const unavailable = shapeGeoHotspotsUnavailableResponse({
          center,
          radius_km,
          window_hours,
          interest,
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
          total_profiles: null,
          suppressed_profiles: null,
          result: 'unavailable',
          reason: String(apiResult.data.reason || ''),
          durationMs: Date.now() - started,
        });
        return geoJsonResult(unavailable);
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
        ...(apiResult.data?.source ? { source: String(apiResult.data.source) } : {}),
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
        'Mutation: creates test retail profiles (with profilePlaceContext at three central seed points of the city: '
        + 'neighborhoods for the ten featured areas, or three anchors ~2 km from the centre for any other catalog city; '
        + 'source "mcp-seed") and one commerce.productViews event each. Uses the current sandbox generation '
        + 'preferences (scaled email + stored mobile) and event target; maximum 30 profiles per call to stay within '
        + 'the per-key generation and event-send limits. Profiles are placed ten per neighborhood across three cells '
        + 'so a full batch of 30 clears the k=10 threshold in every cell. lab_audience_geo_hotspots reads the lab '
        + 'geo mirror, which is written as each profile and event is accepted, so results are visible immediately.',
      inputSchema: {
        city: z.string().trim().min(1).max(120).describe(
          'Seed city: a featured area (riyadh, dubai, london, new york, paris, tokyo, sydney, singapore, são paulo, mumbai) '
            + 'or any catalog city, optionally with ", CC" (e.g. "Nairobi", "Portland, US").',
        ),
        count: z.number().int().min(1).max(30).default(30).describe('Number of test profiles and product-view events (1–30, default 30).'),
        interest: z.string().trim().regex(GEO_INTEREST_PATTERN, GEO_INTEREST_RULE).default('camping gear')
          .describe(`Retail product category and event interest. ${GEO_INTEREST_RULE}`),
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

      const outcome = await runGeoSeedBatch({
        plan,
        deps: {
          resolveEmail: async () => resolveProfileEmailForGenerate({
            sandbox: allowed.sandbox,
            use_stored_prefs: true,
          }),
          generateProfile: async ({ email, seed, emailPlan }) => {
            const attributes = applyStoredPrefsMobileToAttributes(
              mergePersonaAttributes(buildPersonaAttributes('retail', email), geoSeedPlaceAttributes(seed)),
              emailPlan?.mobilePhone,
            );
            const profilePlan = planDualStreamGenerate({ industry: 'retail', attributes, email });
            return executeGeneratePlan({
              email,
              sandbox: allowed.sandbox,
              plan: profilePlan,
              test_profile: true,
            });
          },
          sendEvent: async ({ index, seed, email, ecid }) => {
            const richEvent = buildIndustryEventPayload({
              industry: 'retail',
              industry_fields: {
                productName: seed.interest,
                productCategory: seed.interest,
                sku: `GEO-DEMO-${index + 1}`,
              },
            });
            if (!richEvent.ok) return { ok: false, error: richEvent.error };
            return sendProfileEvent({
              sandbox: allowed.sandbox,
              email,
              ecid,
              target_id: targetCheck.requested_id,
              event_type: 'commerce.productViews',
              channel: 'web',
              timestamp: seed.timestamp,
              public: richEvent.public,
              xdm_style: 'full',
              event_place: geoSeedEventPlace(seed),
            });
          },
        },
      });

      const generated = outcome.generated;
      const sent = outcome.sent;
      const lastError = outcome.lastError;

      const complete = generated === count && sent === count;
      writeAuditLog({
        keyId,
        tool: 'lab_seed_geo_demo',
        sandbox: allowed.sandbox,
        city: plan[0]?.city || '',
        interest,
        count_requested: count,
        profiles_generated: generated,
        events_sent: sent,
        events_failed: outcome.failed,
        aborted: outcome.aborted,
        result: complete ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      const payload = {
        ok: complete,
        kind: 'geo_demo_seed',
        city: String(city),
        resolved_city: plan[0] ? { city: plan[0].city, countryCode: plan[0].country_code } : null,
        seed_clusters: seedClusters(plan),
        interest,
        sandbox: allowed.sandbox,
        count_requested: count,
        profiles_generated: generated,
        events_sent: sent,
        events_failed: outcome.failed,
        aborted: outcome.aborted,
        source: 'aep-event-generator',
        ingestion_note:
          'Profiles and events are written to AEP and to the lab geo mirror as each is accepted, so '
          + 'lab_audience_geo_hotspots can see them immediately. AEP Profile and data-lake views may lag by minutes.',
        generated_at: new Date().toISOString(),
        ...(lastError ? { error: lastError } : {}),
        ...(outcome.errors.length ? { errors: outcome.errors } : {}),
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

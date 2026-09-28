/**
 * Keep minimal events safe by default, while allowing a governed rich-industry opt-in.
 * Coworker supplies industry + industry_fields; the MCP owns public.{industry} nesting.
 */

import { buildIndustryEventPayload, normalizeEventIndustry } from './industryEventPayload.mjs';
import { resolveEventPlace } from './placeParams.mjs';

/** @typedef {Record<string, unknown>} EventParams */

/** Params allowed on minimal Coworker event tool calls. */
export const COWORKER_MINIMAL_EVENT_PARAM_KEYS = Object.freeze([
  'sandbox',
  'email',
  'ecid',
  'target_id',
  'event_type',
  'channel',
  'timestamp',
  'orchestration_event_id',
  'event_id',
  'auto_fetch_ecid',
  'edge_minimal',
  'xdm_style',
  'industry',
  'industry_fields',
  'place_mode',
  'place_area',
  'event_place',
]);

/** Params stripped from Coworker calls — they upgrade server XDM beyond Event tool minimal. */
export const COWORKER_STRIPPED_EVENT_PARAM_KEYS = Object.freeze([
  'view_name',
  'view_url',
  'public',
  'message',
  'xdm_tenant_key',
  'identity_map_ecid_key',
  'primary_identity',
  'email_primary_identity',
]);

/**
 * @param {EventParams} params
 * @param {{ rng?: () => number }} [opts] — rng for place_mode/place_area sampling (tests)
 * @returns {{ params: EventParams, stripped: string[], warnings: string[], errors: string[], richIndustry: object|null }}
 */
export function sanitizeCoworkerEventParams(params = {}, opts = {}) {
  /** @type {EventParams} */
  const out = { ...params };
  /** @type {string[]} */
  const stripped = [];
  /** @type {string[]} */
  const warnings = [];
  const errors = [];

  const industryRaw = typeof out.industry === 'string' ? out.industry.trim() : '';
  const hasIndustryFields =
    out.industry_fields && typeof out.industry_fields === 'object' && !Array.isArray(out.industry_fields);
  const publicRaw = out.public && typeof out.public === 'object' && !Array.isArray(out.public) ? out.public : null;
  let richIndustry = null;

  if (hasIndustryFields && !industryRaw) {
    errors.push('industry is required when industry_fields is provided.');
  } else if (industryRaw) {
    const normalizedIndustry = normalizeEventIndustry(industryRaw);
    const candidateFields = hasIndustryFields
      ? out.industry_fields
      : publicRaw && publicRaw[normalizedIndustry] && typeof publicRaw[normalizedIndustry] === 'object'
        ? publicRaw[normalizedIndustry]
        : publicRaw || undefined;
    const rich = buildIndustryEventPayload({ industry: industryRaw, industry_fields: candidateFields });
    if (!rich.ok) {
      errors.push(rich.error);
    } else {
      richIndustry = rich;
      out.industry = rich.industry;
      out.public = rich.public;
      out.xdm_style = 'full';
      out.edge_minimal = false;
      if (!String(out.event_type || '').trim()) out.event_type = rich.event_type;
      if (!String(out.channel || '').trim()) out.channel = 'web';
      delete out.industry_fields;
    }
  }

  for (const key of COWORKER_STRIPPED_EVENT_PARAM_KEYS) {
    if (richIndustry && key === 'public') continue;
    if (out[key] == null) continue;
    const val = out[key];
    const hasValue =
      typeof val === 'string'
        ? val.trim().length > 0
        : typeof val === 'object' && val !== null && !Array.isArray(val)
          ? Object.keys(val).length > 0
          : val != null && val !== false;
    if (hasValue) {
      stripped.push(key);
      warnings.push(
        `Stripped "${key}" — direct event internals are not accepted. ` +
          'Use industry plus industry_fields for governed rich context; the server builds XDM.',
      );
    }
    delete out[key];
  }

  const place = resolveEventPlace(out, { rng: opts.rng });
  delete out.place_mode;
  delete out.place_area;
  delete out.event_place;
  if (!place.ok) errors.push(place.error);
  else if (place.value) out.event_place = place.value;

  if (out.edge_minimal === false && !richIndustry) {
    stripped.push('edge_minimal');
    delete out.edge_minimal;
    warnings.push('Stripped edge_minimal:false — use industry plus industry_fields to opt into governed full XDM.');
  }
  if (out.xdm_style === 'full' && !richIndustry) {
    stripped.push('xdm_style');
    delete out.xdm_style;
    warnings.push('Stripped xdm_style:full — use industry plus industry_fields to opt into governed full XDM.');
  }

  return { params: out, stripped, warnings, errors, richIndustry };
}

/**
 * Strip view_name / view_url from batch event steps.
 * opts.place: batch-level place_mode/place_area/event_place applied to steps without their own place.
 *
 * @param {Array<Record<string, unknown>>} events
 * @param {{ place?: { place_mode?: string, place_area?: string, event_place?: Record<string, unknown> }, rng?: () => number }} [opts]
 * @returns {{ events: Array<Record<string, unknown>>, stripped: string[], warnings: string[], errors: string[] }}
 */
export function sanitizeCoworkerEventSteps(events = [], opts = {}) {
  const batchPlace = opts.place && typeof opts.place === 'object' ? opts.place : {};
  const stepHasPlace = (step) =>
    step.event_place != null || step.place_mode != null || (typeof step.place_area === 'string' && step.place_area.trim());
  /** @type {string[]} */
  const stripped = [];
  /** @type {string[]} */
  const warnings = [];
  const errors = [];
  const cleaned = events.map((step, index) => {
    if (!step || typeof step !== 'object') return step;
    const withPlace = stepHasPlace(step) ? step : { ...step, ...batchPlace };
    const sanitized = sanitizeCoworkerEventParams(withPlace, { rng: opts.rng });
    if (sanitized.errors.length) {
      errors.push(...sanitized.errors.map((error) => `events[${index}]: ${error}`));
    }
    if (sanitized.richIndustry) {
      warnings.push(
        `events[${index}] uses governed rich industry payload ${sanitized.richIndustry.payloadPath}.*.`,
      );
    }
    const out = { ...sanitized.params };
    stripped.push(...sanitized.stripped.map((key) => `events[${index}].${key}`));
    warnings.push(...sanitized.warnings.map((warning) => `events[${index}]: ${warning}`));
    for (const key of ['view_name', 'view_url', 'message']) {
      if (out[key] == null) continue;
      const val = out[key];
      const hasValue =
        typeof val === 'string'
          ? val.trim().length > 0
          : typeof val === 'object' && val !== null && !Array.isArray(val)
            ? Object.keys(val).length > 0
            : true;
      if (hasValue) {
        stripped.push(`events[${index}].${key}`);
        warnings.push(`Stripped events[${index}].${key} — batch steps allow ONLY event_type, channel, timestamp.`);
      }
      delete out[key];
    }
    return out;
  });
  return { events: cleaned, stripped, warnings, errors };
}

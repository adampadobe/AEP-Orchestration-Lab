import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { buildCommonPersonaAttributes } from './common.mjs';
import { buildFsiPersonaAttributes } from './fsi.mjs';
import { buildGenericPersonaAttributes } from './generic.mjs';
import { buildPortalLoyaltyAttributes } from './loyalty.mjs';
import { buildPlaceContextPersonaAttributes, hasPlaceContextAttributes, isPlaceContextKey } from './placeContext.mjs';
import { buildMediaPersonaAttributes } from './media.mjs';
import { buildRetailPersonaAttributes } from './retail.mjs';
import { buildSportsPersonaAttributes } from './sports.mjs';
import { buildTelecomPersonaAttributes } from './telecom.mjs';
import { buildTravelPersonaAttributes, TRAVEL_ACTIVE_FLIGHT_HINTS } from './travel.mjs';
import { applySegmentHint } from './segments.mjs';

export {
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
  SEGMENT_HINTS_BY_INDUSTRY,
  normalizeSegmentHint,
} from './segments.mjs';

export { buildCommonPersonaAttributes } from './common.mjs';
export { buildPortalLoyaltyAttributes } from './loyalty.mjs';

const INDUSTRY_BUILDERS = {
  retail: buildRetailPersonaAttributes,
  fsi: buildFsiPersonaAttributes,
  travel: buildTravelPersonaAttributes,
  telecom: buildTelecomPersonaAttributes,
  media: buildMediaPersonaAttributes,
  sports: buildSportsPersonaAttributes,
  generic: buildGenericPersonaAttributes,
};

/** Profile Viewer generators gate loyalty behind an explicit toggle per industry. */
const INDUSTRIES_WITH_LOYALTY_TOGGLE = new Set(LAB_INDUSTRY_KEYS);

/**
 * @typedef {object} PersonaBuildOptions
 * @property {boolean} [loyalty_member] - When true, emit LYL-* loyalty (portal toggle default unchecked)
 * @property {boolean} [last_order_details] - Retail only: emit orderProfile last-order block (portal #retailLastOrderEnabled)
 * @property {string} [place_mode] - 'featured' (default: random featured area) | 'global' (anywhere on Earth) | 'area'
 * @property {string} [place_area] - featured area key/name or any catalog city (implies mode 'area' when place_mode is omitted)
 * @property {Record<string, unknown>} [place] - pre-planned place leaves (batch clustering); wins over mode/area
 * @property {boolean} [active_flight] - Travel only: true → upcoming / in-the-air trip (flightBookings.activeFlight "Yes"),
 *   false → completed trip ("No"); omitted → random, or pinned by segment_hint active_flyer / lapsed_flyer
 */

/**
 * Deep-merge persona attributes: randomized base with caller overrides winning.
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} overrides
 * @returns {Record<string, unknown>}
 */
export function mergePersonaAttributes(base, overrides) {
  if (!base || typeof base !== 'object') return overrides && typeof overrides === 'object' ? { ...overrides } : {};
  if (!overrides || typeof overrides !== 'object') return { ...base };
  /** @type {Record<string, unknown>} */
  const out = { ...base };
  // Place context is one coherent location: caller place replaces the persona block, never mixes cities.
  if (hasPlaceContextAttributes(overrides)) {
    for (const key of Object.keys(out)) {
      if (isPlaceContextKey(key)) delete out[key];
    }
  }
  for (const [key, val] of Object.entries(overrides)) {
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = mergePersonaAttributes(/** @type {Record<string, unknown>} */ (out[key]), /** @type {Record<string, unknown>} */ (val));
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Travel active_flyer / lapsed_flyer hints pin active_flight; an explicit
 * active_flight option wins.
 * @param {string} industry
 * @param {string | undefined} segmentHint
 * @param {PersonaBuildOptions} options
 * @returns {PersonaBuildOptions}
 */
function withSegmentPinnedOptions(industry, segmentHint, options) {
  if (industry !== 'travel' || !segmentHint || typeof options.active_flight === 'boolean') return options;
  const pinned = TRAVEL_ACTIVE_FLIGHT_HINTS[String(segmentHint).trim().toLowerCase()];
  return typeof pinned === 'boolean' ? { ...options, active_flight: pinned } : options;
}

/**
 * Build randomized persona attributes for an industry + email.
 * @param {string} industry - canonical industry key
 * @param {string} email
 * @param {string} [segmentHint] - optional segment overlay
 * @param {PersonaBuildOptions} [options]
 * @returns {Record<string, unknown>}
 */
export function buildPersonaAttributes(industry, email, segmentHint, options = {}) {
  const key = LAB_INDUSTRY_KEYS.includes(industry) ? industry : 'generic';
  const industryBuilder = INDUSTRY_BUILDERS[key] || INDUSTRY_BUILDERS.generic;
  const skipLoyalty = INDUSTRIES_WITH_LOYALTY_TOGGLE.has(key);
  const loyaltyMember = options.loyalty_member === true;
  const buildOptions = withSegmentPinnedOptions(key, segmentHint, options);

  let attrs = {
    ...buildCommonPersonaAttributes(email, { skipLoyalty }),
    ...industryBuilder(buildOptions),
    ...buildPlaceContextPersonaAttributes({
      mode: options.place_mode,
      area: options.place_area,
      place: options.place,
    }),
  };

  if (loyaltyMember) {
    attrs = { ...attrs, ...buildPortalLoyaltyAttributes() };
  }

  if (segmentHint) {
    attrs = applySegmentHint(attrs, key, segmentHint);
  }

  return attrs;
}

/**
 * Resolve email for batch item index (1-based).
 * @param {object} opts
 * @param {number} opts.index - 1-based index
 * @param {string} [opts.baseEmail]
 * @param {string} [opts.emailPattern]
 * @param {string} [opts.industry]
 */
export function resolveBatchEmail({ index, baseEmail, emailPattern, industry }) {
  const n = Number(index);
  const ind = String(industry || 'generic').toLowerCase();

  if (emailPattern) {
    return String(emailPattern)
      .replace(/\{n\}/gi, String(n))
      .replace(/\{index\}/gi, String(n))
      .replace(/\{industry\}/gi, ind);
  }

  const base = String(baseEmail || '').trim();
  if (!base) {
    return `lab+mcp-${ind}-${n}@adobetest.com`;
  }

  if (base.includes('@')) {
    const [local, domain] = base.split('@');
    const tag = local.includes('+') ? `${local}-${n}` : `${local}+${ind}-${n}`;
    return `${tag}@${domain}`;
  }

  return `${base}+${ind}-${n}@adobetest.com`;
}

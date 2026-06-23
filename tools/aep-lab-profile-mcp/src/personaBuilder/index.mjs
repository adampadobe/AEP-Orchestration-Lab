import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { buildCommonPersonaAttributes } from './common.mjs';
import { buildFsiPersonaAttributes } from './fsi.mjs';
import { buildGenericPersonaAttributes } from './generic.mjs';
import { buildPortalLoyaltyAttributes } from './loyalty.mjs';
import { buildMediaPersonaAttributes } from './media.mjs';
import { buildRetailPersonaAttributes } from './retail.mjs';
import { buildSportsPersonaAttributes } from './sports.mjs';
import { buildTelecomPersonaAttributes } from './telecom.mjs';
import { buildTravelPersonaAttributes } from './travel.mjs';
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
 */

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

  let attrs = {
    ...buildCommonPersonaAttributes(email, { skipLoyalty }),
    ...industryBuilder(options),
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

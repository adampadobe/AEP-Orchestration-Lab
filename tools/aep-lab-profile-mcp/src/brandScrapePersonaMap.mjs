/**
 * Map Brand Scraper marketing personas → lab personaBuilder XDM attribute overlays.
 * Scrape personas are narrative (goals, pain points); UPS profiles need correlated industry paths.
 * Strategy: randomize industry persona via personaBuilder, then overlay scrape identity fields.
 */

import { LAB_TEST_EMAIL_DOMAIN } from './framework/labFramework.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from './industries.mjs';
import {
  buildPersonaAttributes,
  normalizeSegmentHint,
  SEGMENT_HINTS_BY_INDUSTRY,
} from './personaBuilder.mjs';
import { assign } from './personaBuilder/utils.mjs';

/** Brand Scraper INDUSTRY_TAXONOMY → lab industry keys (functions/brandScraperService.js). */
const SCRAPE_INDUSTRY_TO_LAB = {
  'travel & hospitality': 'travel',
  'financial services': 'fsi',
  'retail & e-commerce': 'retail',
  telecommunications: 'telecom',
  'media & entertainment': 'media',
  automotive: 'generic',
  'technology & software': 'generic',
  'healthcare & pharma': 'generic',
  'energy & utilities': 'generic',
  'consumer packaged goods': 'retail',
  education: 'generic',
  'government & non-profit': 'generic',
  'professional services': 'generic',
  'real estate': 'generic',
  'food & beverage': 'retail',
  'manufacturing & industrial': 'generic',
  other: 'generic',
};

/** Keyword hints in scrape segment names → lab segment_hint tokens. */
const SEGMENT_KEYWORD_HINTS = [
  { patterns: [/high.?value/i, /vip/i, /platinum/i, /loyal/i], hints: { travel: 'hotel_high_value', retail: 'loyalty_vip', fsi: 'high_net_worth' } },
  { patterns: [/reactivat/i, /lapsed/i, /churn/i, /win.?back/i], hints: { travel: 'hotel_reactivation' } },
  { patterns: [/cart.?abandon/i, /abandon/i], hints: { retail: 'cart_abandoner' } },
  { patterns: [/credit.?rebuild/i, /subprime/i, /poor.?credit/i], hints: { fsi: 'credit_rebuild' } },
  { patterns: [/high.?net/i, /wealth/i, /hnw/i], hints: { fsi: 'high_net_worth' } },
];

/**
 * @param {string | null | undefined} scrapeIndustry
 * @returns {{ industry: string, source: string }}
 */
export function inferLabIndustryFromScrape(scrapeIndustry) {
  const raw = String(scrapeIndustry || '').trim();
  if (!raw) {
    return { industry: 'generic', source: 'default' };
  }
  const key = raw.toLowerCase();
  const mapped = SCRAPE_INDUSTRY_TO_LAB[key];
  if (mapped && LAB_INDUSTRY_KEYS.includes(mapped)) {
    return { industry: mapped, source: 'scrape_taxonomy' };
  }
  const norm = normalizeIndustry(key);
  if (LAB_INDUSTRY_KEYS.includes(norm.industry)) {
    return { industry: norm.industry, source: 'lab_alias' };
  }
  return { industry: 'generic', source: 'fallback' };
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {Array<Record<string, unknown>>}
 */
export function extractBrandScrapePersonas(record) {
  if (!record || typeof record !== 'object') return [];
  const block = /** @type {Record<string, unknown>} */ (record.personas || {});
  if (block.skipped || block.error) return [];
  const list = Array.isArray(block.personas) ? block.personas : [];
  return list.filter((p) => p && typeof p === 'object');
}

/**
 * @param {string} name
 */
export function parsePersonaName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: 'Demo', lastName: 'Customer' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Customer' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * @param {string} location
 */
export function parsePersonaLocation(location) {
  const raw = String(location || '').trim();
  if (!raw) return { city: null, country: null };
  const comma = raw.lastIndexOf(',');
  if (comma > 0) {
    return {
      city: raw.slice(0, comma).trim() || null,
      country: raw.slice(comma + 1).trim() || null,
    };
  }
  return { city: raw, country: null };
}

/**
 * @param {string[] | undefined} channels
 */
export function mapPreferredChannel(channels) {
  const list = Array.isArray(channels) ? channels : [];
  for (const ch of list) {
    const c = String(ch || '').toLowerCase();
    if (c.includes('email')) return 'email';
    if (c.includes('sms') || c.includes('text')) return 'sms';
    if (c.includes('phone') || c.includes('call')) return 'phone';
    if (c.includes('push')) return 'push';
    if (c.includes('web')) return 'email';
  }
  return null;
}

/**
 * @param {string} industry
 * @param {string[] | undefined} suggestedSegments
 * @returns {string | null}
 */
export function inferSegmentHintFromScrape(industry, suggestedSegments) {
  const hints = SEGMENT_HINTS_BY_INDUSTRY[industry] || [];
  if (!hints.length) return null;

  const segments = Array.isArray(suggestedSegments) ? suggestedSegments : [];
  const joined = segments.join(' ').toLowerCase();

  for (const rule of SEGMENT_KEYWORD_HINTS) {
    if (!rule.hints[industry]) continue;
    if (rule.patterns.some((re) => re.test(joined))) {
      const candidate = rule.hints[industry];
      if (hints.includes(candidate)) return candidate;
    }
  }

  for (const seg of segments) {
    const s = String(seg || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    for (const h of hints) {
      if (s.includes(h.replace(/_/g, '')) || h.includes(s.replace(/_/g, ''))) return h;
    }
  }

  return null;
}

/**
 * Slug for plus-address local part.
 * @param {string} value
 */
function slugPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'persona';
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.persona
 * @param {string} [params.brandName]
 * @param {number} [params.personaIndex]
 */
export function suggestEmailForScrapePersona({ persona, brandName, personaIndex = 0 }) {
  const { firstName } = parsePersonaName(persona.name);
  const brand = slugPart(brandName);
  const person = slugPart(firstName);
  const n = Number(personaIndex) >= 0 ? Number(personaIndex) + 1 : 1;
  return `${brand}.${person}+${n}@${LAB_TEST_EMAIL_DOMAIN}`;
}

/**
 * Overlay scrape persona identity onto randomized industry attributes.
 * @param {object} params
 * @param {Record<string, unknown>} params.persona
 * @param {string} params.email
 * @param {string} params.industry
 * @param {string | null} [params.segmentHint]
 * @param {boolean} [params.loyalty_member]
 * @param {boolean} [params.last_order_details]
 * @returns {{ attributes: Record<string, unknown>, segmentHint: string | null, overlays: string[] }}
 */
export function buildAttributesFromBrandScrapePersona({
  persona,
  email,
  industry,
  segmentHint = null,
  loyalty_member = false,
  last_order_details,
}) {
  const resolvedHint =
    segmentHint ||
    inferSegmentHintFromScrape(industry, /** @type {string[]} */ (persona.suggested_segments));

  let segmentNorm = null;
  if (resolvedHint) {
    const norm = normalizeSegmentHint(resolvedHint, industry);
    if (typeof norm === 'string' && !norm.includes('Unknown') && !norm.includes('not supported')) {
      segmentNorm = norm;
    }
  }

  let attrs = buildPersonaAttributes(industry, email, segmentNorm, {
    loyalty_member: loyalty_member === true,
    last_order_details,
  });

  const overlays = [];
  const { firstName, lastName } = parsePersonaName(persona.name);
  assign(attrs, 'person.name.firstName', firstName);
  assign(attrs, 'person.name.lastName', lastName);
  overlays.push('person.name');

  if (persona.age != null && Number.isFinite(Number(persona.age))) {
    const age = Math.round(Number(persona.age));
    assign(attrs, 'individualCharacteristics.core.age', age);
    const birthYear = new Date().getUTCFullYear() - age;
    assign(attrs, 'person.birthDate', `${birthYear}-06-15`);
    overlays.push('age/birthDate');
  }

  if (persona.occupation) {
    assign(attrs, 'individualCharacteristics.core.occupation', String(persona.occupation).slice(0, 120));
    overlays.push('occupation');
  }

  const loc = parsePersonaLocation(/** @type {string} */ (persona.location));
  if (loc.city) {
    assign(attrs, 'homeAddress.city', loc.city.slice(0, 80));
    overlays.push('homeAddress.city');
  }
  if (loc.country) {
    assign(attrs, 'homeAddress.country', loc.country.slice(0, 80));
    overlays.push('homeAddress.country');
  }

  const channel = mapPreferredChannel(/** @type {string[]} */ (persona.preferred_channels));
  if (channel) {
    assign(attrs, 'consents.marketing.preferred', channel);
    overlays.push('consents.marketing.preferred');
  }

  assign(attrs, 'personalEmail.address', email);

  return { attributes: attrs, segmentHint: segmentNorm, overlays };
}

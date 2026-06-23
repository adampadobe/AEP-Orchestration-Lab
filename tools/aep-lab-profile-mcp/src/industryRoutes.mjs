/**
 * Industry → lab API route prefix mapping (mirrors functions/profileRoutes.js).
 */

/** @type {Record<string, string>} */
export const INDUSTRY_ROUTE_PREFIX = {
  generic: 'generic-profile',
  travel: 'travel-profile',
  fsi: 'fsi-profile',
  telecom: 'telecom-profile',
  retail: 'retail-profile',
  media: 'media-profile',
  sports: 'sports-profile',
};

/**
 * @param {string} industry - canonical industry key
 * @returns {string | null}
 */
export function routePrefixForIndustry(industry) {
  return INDUSTRY_ROUTE_PREFIX[String(industry || '').toLowerCase()] || null;
}

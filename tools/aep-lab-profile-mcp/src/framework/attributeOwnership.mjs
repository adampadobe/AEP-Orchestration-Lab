/**
 * Path → industry ownership (mirrors functions/industryAttributeMap.js).
 * Keep in sync when RAW_PATH_OWNERSHIP changes in the lab functions package.
 */

const TENANT_PREFIX = '_demoemea.';

const RESOLUTION_REASON = {
  PREFIX_MATCH: (prefix) => `matched ${prefix}*`,
  CATCH_ALL_GENERIC: 'matched Generic catch-all (no industry-specific prefix)',
  UNOWNED: 'no industry schema declares this path',
};

/** @type {Array<{ industry: string, prefixes: string[] }>} */
const RAW_PATH_OWNERSHIP = [
  {
    industry: 'fsi',
    prefixes: [
      'industryFsi.',
      'personalFinances.',
      '<TENANT>industryFsi.',
      '<TENANT>individualCharacteristics.fsi.',
      '<TENANT>personalFinances.',
    ],
  },
  {
    industry: 'telecom',
    prefixes: [
      'industryTelecom.',
      'telecomSubscription.',
      '<TENANT>industryTelecom.',
      '<TENANT>individualCharacteristics.telecom.',
      '<TENANT>telecomSubscription.',
    ],
  },
  {
    industry: 'retail',
    prefixes: [
      'industryRetail.',
      'individualCharacteristics.retail.',
      'scoring.retail.',
      '<TENANT>industryRetail.',
      '<TENANT>individualCharacteristics.retail.',
      '<TENANT>scoring.retail.',
    ],
  },
  {
    industry: 'travel',
    prefixes: [
      'travelReservations.',
      'travelPreferences.',
      'industryTravel.',
      'hotel.',
      'individualCharacteristics.travel.',
      '<TENANT>travelReservations.',
      '<TENANT>travelPreferences.',
      '<TENANT>industryTravel.',
      '<TENANT>individualCharacteristics.travel.',
      '<TENANT>hotel.',
    ],
  },
  {
    industry: 'media',
    prefixes: [
      'industryMedia.',
      'subscriptions.',
      '<TENANT>industryMedia.',
      '<TENANT>individualCharacteristics.media.',
      '<TENANT>subscriptions.',
    ],
  },
  {
    industry: 'sports',
    prefixes: [
      'industrySports.',
      '<TENANT>industrySports.',
      '<TENANT>individualCharacteristics.sports.',
    ],
  },
  {
    industry: 'generic',
    prefixes: [
      'personalEmail.',
      'mobilePhone.',
      'homePhone.',
      'workPhone.',
      'workAddress.',
      'homeAddress.',
      'billingAddress.',
      'mailingAddress.',
      'shippingAddress.',
      'person.',
      'personID',
      'loyalty.',
      'loyaltyDetails.',
      'consents.',
      'optInOut.',
      'preferences.',
      'preferredLanguage',
      'orderProfile.',
      'individualCharacteristics.core.',
      'identification.core.',
      'identification.',
      'identityMap.',
      'scoring.',
      'demoEnvironment.',
      'metadata.',
      'xdm:testProfile',
      'testProfile',
      '_id',
      '_repo.',
      '<TENANT>identification.',
      '<TENANT>individualCharacteristics.core.',
      '<TENANT>person.',
      '<TENANT>consents.',
      '<TENANT>optInOut.',
      '<TENANT>preferences.',
      '<TENANT>preferredLanguage',
      '<TENANT>loyalty.',
      '<TENANT>loyaltyDetails.',
      '<TENANT>orderProfile.',
      '<TENANT>scoring.',
      '<TENANT>demoEnvironment.',
      '<TENANT>personalEmail.',
      '<TENANT>mobilePhone.',
      '<TENANT>homeAddress.',
    ],
  },
];

function expandTenantPrefixes(tenantPrefix) {
  return RAW_PATH_OWNERSHIP.map((entry) => ({
    industry: entry.industry,
    prefixes: entry.prefixes.map((p) =>
      p.startsWith('<TENANT>') ? p.replace('<TENANT>', tenantPrefix) : p,
    ),
  }));
}

const PATH_OWNERSHIP = expandTenantPrefixes(TENANT_PREFIX);

function stripPrimaryTenantNamespaceForOwnership(path) {
  const trimmed = String(path || '').trim();
  const m = /^(_[A-Za-z0-9]+)\.(.+)$/.exec(trimmed);
  if (!m) return trimmed;
  const head = m[1];
  if (head === '_id' || head === '_repo') return trimmed;
  return m[2];
}

/**
 * @param {string} path
 * @returns {{ industry: string|null, reason: string }}
 */
export function resolveIndustryForPath(path) {
  if (!path || typeof path !== 'string') {
    return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
  }
  const matchPath = stripPrimaryTenantNamespaceForOwnership(trimmed);
  for (const entry of PATH_OWNERSHIP) {
    for (const prefix of entry.prefixes) {
      if (
        matchPath === prefix ||
        matchPath.startsWith(prefix) ||
        (!prefix.endsWith('.') && matchPath === prefix)
      ) {
        const reason =
          entry.industry === 'generic'
            ? RESOLUTION_REASON.CATCH_ALL_GENERIC
            : RESOLUTION_REASON.PREFIX_MATCH(prefix);
        return { industry: entry.industry, reason };
      }
    }
  }
  return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
}

/**
 * Industry keys aligned with functions/profileGenerateService.js INDUSTRY_TO_CONNECTION_STORE.
 * Aliases are normalized before calling lab APIs.
 */

/** @type {readonly string[]} */
export const LAB_INDUSTRY_KEYS = [
  'generic',
  'travel',
  'fsi',
  'telecom',
  'retail',
  'media',
  'sports',
];

/** @type {Record<string, { key: string, note?: string }>} */
export const INDUSTRY_ALIASES = {
  telecommunications: { key: 'telecom', note: 'Alias for telecom (lab canonical key).' },
  telco: { key: 'telecom', note: 'Alias for telecom.' },
  public: { key: 'generic', note: 'Alias for generic (public / cross-industry profiles).' },
};

/**
 * @param {string | undefined | null} raw
 * @returns {{ industry: string, normalizedFrom?: string, aliasNote?: string }}
 */
export function normalizeIndustry(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed) {
    return { industry: 'generic', aliasNote: 'Default industry when omitted.' };
  }

  if (LAB_INDUSTRY_KEYS.includes(trimmed)) {
    return { industry: trimmed };
  }

  const alias = INDUSTRY_ALIASES[trimmed];
  if (alias) {
    return {
      industry: alias.key,
      normalizedFrom: trimmed,
      aliasNote: alias.note,
    };
  }

  return {
    industry: trimmed,
    normalizedFrom: trimmed,
  };
}

/**
 * Static catalog for lab_list_industries (no HTTP round trip).
 */
export function listIndustriesCatalog() {
  const industries = LAB_INDUSTRY_KEYS.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  }));

  const aliases = Object.entries(INDUSTRY_ALIASES).map(([alias, { key, note }]) => ({
    alias,
    mapsTo: key,
    note,
  }));

  return {
    ok: true,
    industries,
    aliases,
    notes: [
      'Use canonical keys when calling lab_generate_profile.',
      'telecommunications and telco normalize to telecom.',
      'public normalizes to generic.',
    ],
  };
}

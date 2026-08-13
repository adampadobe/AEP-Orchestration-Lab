/**
 * Safe, tool-level industry event details. Coworker supplies an industry plus
 * flat fields; the MCP wraps them as public.{industry} and requests full XDM.
 * Raw XDM, tenant nodes, schema fragments, and arbitrary public keys never pass
 * through this contract.
 */

const STRING = 'string';
const NUMBER = 'number';
const OBJECT = 'object';

export const INDUSTRY_EVENT_SPECS = Object.freeze({
  generic: {
    eventType: 'web.webPageDetails.pageViews',
    fields: { ctaLabel: STRING, linkUrl: STRING },
    defaults: { ctaLabel: 'View details', linkUrl: 'https://example.com/details' },
  },
  retail: {
    eventType: 'commerce.productViews',
    fields: { productName: STRING, sku: STRING, productCategory: STRING, orderValue: NUMBER, cartId: STRING },
    defaults: { productName: 'Featured product', sku: 'SKU-001', productCategory: 'Featured' },
  },
  fsi: {
    eventType: 'accountapplication.complete',
    fields: { productType: STRING, applicationStep: STRING, depositAmount: NUMBER, accountType: STRING },
    defaults: { productType: 'Savings account', applicationStep: 'Submitted', accountType: 'Savings' },
  },
  telecom: {
    eventType: 'telecom.plan.upgrade',
    fields: { planTier: STRING, planAction: STRING },
    defaults: { planTier: 'Unlimited 5G', planAction: 'upgrade_offer' },
  },
  media: {
    eventType: 'media.contentView',
    fields: { contentTitle: STRING, genre: STRING, subscriptionTier: STRING, insider: OBJECT },
    nestedFields: { insider: { action: STRING, newsletter: STRING } },
    defaults: { contentTitle: 'Featured content', genre: 'Drama', subscriptionTier: 'Premium' },
  },
  travel: {
    eventType: 'travel.flight.search',
    fields: {
      hotelName: STRING,
      hotelLocation: STRING,
      hotelItineraryId: STRING,
      checkInDate: STRING,
      confirmationNumber: STRING,
      departureAirport: STRING,
      arrivalAirport: STRING,
    },
    // Flight defaults intentionally avoid the retired hotel.* compatibility mapping.
    defaults: { departureAirport: 'LHR', arrivalAirport: 'DXB', confirmationNumber: 'FLT-DEMO-001' },
  },
  sports: {
    eventType: 'commerce.purchases',
    fields: { eventName: STRING, team: STRING, ticketType: STRING, orderValue: NUMBER },
    defaults: { eventName: 'Upcoming fixture', team: 'City FC', ticketType: 'Adult', orderValue: 65 },
  },
  public: {
    eventType: 'donation.made',
    fields: { donationAmount: NUMBER, donationDate: STRING, eventRegistration: STRING },
    defaults: {
      donationAmount: 25,
      donationDate: new Date().toISOString().slice(0, 10),
      eventRegistration: 'Community fundraiser',
    },
  },
});

export const INDUSTRY_EVENT_IDS = Object.freeze(Object.keys(INDUSTRY_EVENT_SPECS));

const INDUSTRY_ALIASES = Object.freeze({
  telco: 'telecom',
  telecommunications: 'telecom',
  'financial-services': 'fsi',
  financial_services: 'fsi',
  'public-sector': 'public',
  public_sector: 'public',
  nonprofit: 'public',
});

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEventIndustry(value) {
  const raw = String(value || '').trim().toLowerCase();
  return INDUSTRY_ALIASES[raw] || raw;
}

function normalizeValue(type, value, path) {
  if (type === NUMBER) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${path} must be a number.` };
  }
  if (type === STRING) {
    if (value == null) return { ok: false, error: `${path} must be a string.` };
    const s = String(value).trim();
    return s ? { ok: true, value: s } : { ok: false, error: `${path} must not be empty.` };
  }
  if (type === OBJECT && isRecord(value)) return { ok: true, value };
  return { ok: false, error: `${path} must be an object.` };
}

/**
 * @param {object} input
 * @param {string} input.industry
 * @param {Record<string, unknown>} [input.industry_fields]
 */
export function buildIndustryEventPayload({ industry, industry_fields } = {}) {
  const normalizedIndustry = normalizeEventIndustry(industry);
  const spec = INDUSTRY_EVENT_SPECS[normalizedIndustry];
  if (!spec) {
    return {
      ok: false,
      error: `Unsupported event industry "${String(industry || '').trim()}". Allowed: ${INDUSTRY_EVENT_IDS.join(', ')}.`,
      allowedIndustries: INDUSTRY_EVENT_IDS,
    };
  }

  if (industry_fields != null && !isRecord(industry_fields)) {
    return { ok: false, error: 'industry_fields must be an object of field names and values.' };
  }

  const source = industry_fields && Object.keys(industry_fields).length ? industry_fields : spec.defaults;
  const unknown = Object.keys(source).filter((key) => !Object.prototype.hasOwnProperty.call(spec.fields, key));
  if (unknown.length) {
    return {
      ok: false,
      error: `Unsupported ${normalizedIndustry} industry field(s): ${unknown.join(', ')}. Allowed: ${Object.keys(spec.fields).join(', ')}.`,
      allowedFields: Object.keys(spec.fields),
    };
  }

  const normalizedFields = {};
  for (const [key, value] of Object.entries(source)) {
    if (value == null || value === '') continue;
    const normalized = normalizeValue(spec.fields[key], value, `industry_fields.${key}`);
    if (!normalized.ok) return normalized;

    if (spec.fields[key] === OBJECT) {
      const nestedSpec = spec.nestedFields?.[key] || {};
      const nestedUnknown = Object.keys(normalized.value).filter(
        (nestedKey) => !Object.prototype.hasOwnProperty.call(nestedSpec, nestedKey),
      );
      if (nestedUnknown.length) {
        return {
          ok: false,
          error: `Unsupported ${normalizedIndustry} ${key} field(s): ${nestedUnknown.join(', ')}. Allowed: ${Object.keys(nestedSpec).join(', ')}.`,
        };
      }
      const nestedOut = {};
      for (const [nestedKey, nestedValue] of Object.entries(normalized.value)) {
        if (nestedValue == null || nestedValue === '') continue;
        const nestedNormalized = normalizeValue(
          nestedSpec[nestedKey],
          nestedValue,
          `industry_fields.${key}.${nestedKey}`,
        );
        if (!nestedNormalized.ok) return nestedNormalized;
        nestedOut[nestedKey] = nestedNormalized.value;
      }
      if (Object.keys(nestedOut).length) normalizedFields[key] = nestedOut;
    } else {
      normalizedFields[key] = normalized.value;
    }
  }

  if (!Object.keys(normalizedFields).length) {
    return { ok: false, error: `No usable ${normalizedIndustry} industry fields were provided.` };
  }

  return {
    ok: true,
    industry: normalizedIndustry,
    event_type: spec.eventType,
    industry_fields: normalizedFields,
    public: { [normalizedIndustry]: normalizedFields },
    payloadPath: `_demoemea.public.${normalizedIndustry}`,
    usedDefaults: !industry_fields || Object.keys(industry_fields).length === 0,
  };
}

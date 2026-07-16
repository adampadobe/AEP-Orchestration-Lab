/**
 * ExperienceEvent field groups for Event Tool industry scenarios — one FG per industry slice.
 * Paths: _{tenant}.public.{industryId}.* (plus Travel - Hotel Experience v1 for hotel.*).
 */

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

/** @deprecated Retired monolith — detach from schema on industry attach step. */
const EVENT_INDUSTRY_PUBLIC_FG_TITLE = 'AEP Lab - Event Industry Public v1';

/** Industry slice keys under tenant `public` (matches event-industry-catalog.js ids). */
const INDUSTRY_PUBLIC_SLICE_IDS = ['generic', 'retail', 'fsi', 'telecom', 'media', 'travel', 'sports', 'public'];

function xdmStringField(title) {
  return { type: 'string', title, 'meta:xdmType': 'string' };
}

function xdmNumberField(title) {
  return { type: 'number', title, 'meta:xdmType': 'number' };
}

/**
 * @typedef {{ title: string, industryId: string, description: string, properties: object }} IndustryFieldGroupSpec
 */

/** @type {IndustryFieldGroupSpec[]} */
const EVENT_INDUSTRY_FIELD_GROUP_SPECS = [
  {
    title: 'AEP Lab - Event Generic v1',
    industryId: 'generic',
    description: 'AEP Orchestration Lab — tenant public.generic.* (CTA / link context).',
    properties: {
      ctaLabel: xdmStringField('CTA label'),
      linkUrl: xdmStringField('Link URL'),
    },
  },
  {
    title: 'AEP Lab - Event Retail v1',
    industryId: 'retail',
    description: 'AEP Orchestration Lab — tenant public.retail.* (commerce product context).',
    properties: {
      productName: xdmStringField('Product name'),
      sku: xdmStringField('SKU'),
      productCategory: xdmStringField('Product category'),
      orderValue: xdmNumberField('Order value'),
      cartId: xdmStringField('Cart ID'),
    },
  },
  {
    title: 'AEP Lab - Event FSI v1',
    industryId: 'fsi',
    description: 'AEP Orchestration Lab — tenant public.fsi.* (financial services journey).',
    properties: {
      productType: xdmStringField('Product / account type'),
      applicationStep: xdmStringField('Application step'),
      depositAmount: xdmNumberField('Deposit amount'),
      accountType: xdmStringField('Account type'),
    },
  },
  {
    title: 'AEP Lab - Event Telecom v1',
    industryId: 'telecom',
    description: 'AEP Orchestration Lab — tenant public.telecom.* (plan browse / upgrade).',
    properties: {
      planTier: xdmStringField('Plan tier'),
      planAction: xdmStringField('Plan action'),
    },
  },
  {
    title: 'AEP Lab - Event Media v1',
    industryId: 'media',
    description: 'AEP Orchestration Lab — tenant public.media.* (content + insider).',
    properties: {
      contentTitle: xdmStringField('Content title'),
      genre: xdmStringField('Genre'),
      subscriptionTier: xdmStringField('Subscription tier'),
      insider: {
        type: 'object',
        title: 'Insider interaction',
        properties: {
          action: xdmStringField('Action'),
          newsletter: xdmStringField('Newsletter'),
        },
        'meta:xdmType': 'object',
      },
    },
  },
  {
    title: 'AEP Lab - Event Travel v1',
    industryId: 'travel',
    description: 'AEP Orchestration Lab — tenant public.travel.* (hotel + flight context).',
    properties: {
      hotelName: xdmStringField('Hotel name'),
      hotelLocation: xdmStringField('Hotel location'),
      hotelItineraryId: xdmStringField('Hotel itinerary ID'),
      checkInDate: xdmStringField('Check-in date'),
      confirmationNumber: xdmStringField('Confirmation number'),
      departureAirport: xdmStringField('Departure airport'),
      arrivalAirport: xdmStringField('Arrival airport'),
    },
  },
  {
    title: 'AEP Lab - Event Sports v1',
    industryId: 'sports',
    description: 'AEP Orchestration Lab — tenant public.sports.* (fixtures + tickets).',
    properties: {
      eventName: xdmStringField('Event name'),
      team: xdmStringField('Team'),
      ticketType: xdmStringField('Ticket type'),
      orderValue: xdmNumberField('Order value'),
    },
  },
  {
    title: 'AEP Lab - Event Public Sector v1',
    industryId: 'public',
    description: 'AEP Orchestration Lab — tenant public.public.* (nonprofit / civic events).',
    properties: {
      donationAmount: xdmNumberField('Donation amount'),
      donationDate: xdmStringField('Donation date'),
      eventRegistration: xdmStringField('Event registration'),
    },
  },
];

function tenantKeyFromId(tenantId) {
  const tid = String(tenantId || '').trim().replace(/^_/, '');
  return tid ? `_${tid}` : '_demoemea';
}

/**
 * @param {string} tenantId e.g. demoemea (no leading underscore)
 * @param {IndustryFieldGroupSpec} spec
 */
function buildEventIndustryFieldGroupForSpec(tenantId, spec) {
  const tenantKey = tenantKeyFromId(tenantId);
  const industryId = spec.industryId;
  return {
    title: spec.title,
    description: spec.description,
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    properties: {
      [tenantKey]: {
        type: 'object',
        properties: {
          public: {
            type: 'object',
            title: 'Industry event context',
            description: `Tenant public.${industryId}.* for Event Tool industry scenarios.`,
            properties: {
              [industryId]: {
                type: 'object',
                title: `${industryId} industry context`,
                properties: spec.properties,
                'meta:xdmType': 'object',
              },
            },
            'meta:xdmType': 'object',
          },
        },
        'meta:xdmType': 'object',
      },
    },
  };
}

/** @deprecated Monolithic FG — kept for detach / migration only. */
function buildEventIndustryPublicV1ExperienceEventFieldGroup(tenantId) {
  const tenantKey = tenantKeyFromId(tenantId);
  const allLeaves = {};
  for (const spec of EVENT_INDUSTRY_FIELD_GROUP_SPECS) {
    Object.assign(allLeaves, spec.properties);
  }
  return {
    title: EVENT_INDUSTRY_PUBLIC_FG_TITLE,
    description:
      'AEP Orchestration Lab — retired monolithic public.* FG (replaced by per-industry field groups).',
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    definitions: {
      eventIndustryPublicBlock: {
        type: 'object',
        properties: {
          [tenantKey]: {
            type: 'object',
            properties: {
              public: {
                type: 'object',
                title: 'Industry event context',
                properties: allLeaves,
                'meta:xdmType': 'object',
              },
            },
            'meta:xdmType': 'object',
          },
        },
        'meta:xdmType': 'object',
      },
    },
    allOf: [{ $ref: '#/definitions/eventIndustryPublicBlock' }],
  };
}

module.exports = {
  EVENT_INDUSTRY_PUBLIC_FG_TITLE,
  EVENT_INDUSTRY_FIELD_GROUP_SPECS,
  INDUSTRY_PUBLIC_SLICE_IDS,
  buildEventIndustryFieldGroupForSpec,
  buildEventIndustryPublicV1ExperienceEventFieldGroup,
};

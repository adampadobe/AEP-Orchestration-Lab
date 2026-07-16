/**
 * ExperienceEvent field groups for Event Tool industry scenarios (single shared schema).
 */

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

const EVENT_INDUSTRY_PUBLIC_FG_TITLE = 'AEP Lab - Event Industry Public v1';

function xdmStringField(title) {
  return { type: 'string', title, 'meta:xdmType': 'string' };
}

function xdmNumberField(title) {
  return { type: 'number', title, 'meta:xdmType': 'number' };
}

/** Tenant `public.*` leaves used by event-industry-catalog.js scenarios. */
const EVENT_INDUSTRY_PUBLIC_INNER = {
  public: {
    type: 'object',
    title: 'Industry event context',
    description: 'Shared public.* namespace for lab industry event scenarios on one ExperienceEvent schema.',
    properties: {
      productName: xdmStringField('Product name'),
      sku: xdmStringField('SKU'),
      productCategory: xdmStringField('Product category'),
      orderValue: xdmNumberField('Order value'),
      cartId: xdmStringField('Cart ID'),
      ctaLabel: xdmStringField('CTA label'),
      linkUrl: xdmStringField('Link URL'),
      productType: xdmStringField('Product / account type'),
      applicationStep: xdmStringField('Application step'),
      depositAmount: xdmNumberField('Deposit amount'),
      accountType: xdmStringField('Account type'),
      planTier: xdmStringField('Plan tier'),
      planAction: xdmStringField('Plan action'),
      contentTitle: xdmStringField('Content title'),
      genre: xdmStringField('Genre'),
      subscriptionTier: xdmStringField('Subscription tier'),
      hotelName: xdmStringField('Hotel name'),
      hotelLocation: xdmStringField('Hotel location'),
      hotelItineraryId: xdmStringField('Hotel itinerary ID'),
      checkInDate: xdmStringField('Check-in date'),
      confirmationNumber: xdmStringField('Confirmation number'),
      departureAirport: xdmStringField('Departure airport'),
      arrivalAirport: xdmStringField('Arrival airport'),
      eventName: xdmStringField('Event name'),
      team: xdmStringField('Team'),
      ticketType: xdmStringField('Ticket type'),
      donationAmount: xdmNumberField('Donation amount'),
      donationDate: xdmStringField('Donation date'),
      eventRegistration: xdmStringField('Event registration'),
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
    'meta:xdmType': 'object',
  },
};

/**
 * @param {string} tenantId e.g. demoemea (no leading underscore)
 */
function buildEventIndustryPublicV1ExperienceEventFieldGroup(tenantId) {
  const tid = String(tenantId || '').trim();
  const tk = tid.startsWith('_') ? tid : `_${tid}`;
  return {
    title: EVENT_INDUSTRY_PUBLIC_FG_TITLE,
    description:
      'AEP Orchestration Lab — tenant public.* for industry event scenarios (retail, FSI, travel, media, sports, telecom, public).',
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    definitions: {
      eventIndustryPublicBlock: {
        type: 'object',
        properties: {
          [tk]: {
            type: 'object',
            properties: EVENT_INDUSTRY_PUBLIC_INNER,
            'meta:xdmType': 'object',
          },
        },
        'meta:xdmType': 'object',
      },
    },
    allOf: [{ $ref: `#/definitions/eventIndustryPublicBlock` }],
  };
}

module.exports = {
  EVENT_INDUSTRY_PUBLIC_FG_TITLE,
  buildEventIndustryPublicV1ExperienceEventFieldGroup,
};

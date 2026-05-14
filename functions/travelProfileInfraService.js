/**
 * AEP Lab "Travel Profile" wizard — thin config wrapper around
 * `profileInfraFactory`. Mirrors `genericProfileInfraService.js` exactly,
 * but additionally attaches the Adobe-OOTB **Travel Preferences** field
 * group (`https://ns.adobe.com/xdm/mixins/profile/travel-preferences`)
 * which is the only Travel-themed Adobe field group intended for the
 * Profile class.
 *
 * Why ExperienceEvent FGs are NOT in this list
 * --------------------------------------------
 * Flight Reservation, Dining Reservation, and Upgrade Details are scoped
 * to the ExperienceEvent class (`meta:intendedToExtend` enforced by the
 * Schema Registry) and would be rejected by step 2 if attached here.
 * Travel-specific reservation attributes therefore continue to ride on
 * Profile Core v2's tenant subtree
 * (`_<tenant>.individualCharacteristics.travel.*`,
 * `_<tenant>.travelReservations.*`); a separate Travel ExperienceEvent
 * pipeline is the right home for canonical event data — see plan
 * "Out of scope" / follow-ups.
 *
 * Phase 0 refactor preserves the original public surface 1:1 so
 * `functions/index.js` doesn't need to be touched: the same exported
 * functions (`runTravelProfileInfraStatus`, `runTravelProfileInfraStep`)
 * and constants (`TRAVEL_PROFILE_*`) remain available with identical
 * return shapes.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const TRAVEL_PROFILE_SCHEMA_TITLE = 'AEP Lab - Travel Profile - Schema';
const TRAVEL_PROFILE_DATASET_NAME = 'AEP Lab - Travel Profile - Dataset';
const TRAVEL_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Travel Profile - Dataflow';

const TRAVEL_HOTEL_EXPERIENCE_V1_PROPERTIES = {
  hotel: {
    type: 'object',
    title: 'Hotel Experience',
    description:
      'Hotel stay lifecycle: booking details, check-in experience, in-stay services, and check-out rating.',
    properties: {
      bookingDetails: {
        type: 'object',
        title: 'Booking details',
        properties: {
          hotelName: { type: 'string', title: 'Hotel name' },
          hotelLocation: { type: 'string', title: 'Hotel location / city' },
          hotelChain: { type: 'string', title: 'Hotel chain' },
          checkInDate: { type: 'string', title: 'Check-in date', format: 'date' },
          checkOutDate: { type: 'string', title: 'Check-out date', format: 'date' },
          nightsStay: { type: 'integer', title: 'Nights this stay' },
          totalNights: { type: 'integer', title: 'Total nights past year' },
          roomType: { type: 'string', title: 'Room type' },
          rateCode: { type: 'string', title: 'Rate code' },
          roomNumber: { type: 'string', title: 'Room number' },
          confirmationNumber: { type: 'string', title: 'Confirmation number' },
          roomCost: { type: 'number', title: 'Room cost per night' },
          totalCost: { type: 'number', title: 'Total stay cost' },
        },
      },
      checkIn: {
        type: 'object',
        title: 'Check-in experience',
        properties: {
          checkInMethod: { type: 'string', title: 'Check-in method' },
          queueTime: { type: 'integer', title: 'Queue time (minutes)' },
          earlyCheckIn: { type: 'boolean', title: 'Early check-in' },
          roomReady: { type: 'boolean', title: 'Room ready on arrival' },
          upgradedRoom: { type: 'boolean', title: 'Room upgraded' },
          welcomeAmenities: { type: 'boolean', title: 'Welcome amenities provided' },
        },
      },
      housekeeping: {
        type: 'object',
        title: 'Housekeeping',
        properties: {
          doNotDisturb: { type: 'boolean', title: 'Do not disturb' },
          extraTowels: { type: 'boolean', title: 'Extra towels requested' },
          serviceRequested: { type: 'boolean', title: 'Housekeeping service requested' },
          cleanlinessRating: { type: 'integer', title: 'Cleanliness rating (1–10)' },
        },
      },
      amenities: {
        type: 'object',
        title: 'Amenity usage',
        properties: {
          amenityType: { type: 'string', title: 'Amenity type' },
          satisfactionRating: { type: 'integer', title: 'Amenity satisfaction rating (1–10)' },
        },
      },
      roomService: {
        type: 'object',
        title: 'Room service',
        properties: {
          interactionType: { type: 'string', title: 'Room service interaction type' },
          orderTotal: { type: 'number', title: 'Room service order total' },
          serviceRating: { type: 'integer', title: 'Room service rating (1–10)' },
        },
      },
      checkOut: {
        type: 'object',
        title: 'Check-out and rating',
        properties: {
          checkOutMethod: { type: 'string', title: 'Check-out method' },
          lateCheckOut: { type: 'boolean', title: 'Late check-out' },
          overallRating: { type: 'integer', title: 'Overall stay rating (1–10)' },
          finalBillAmount: { type: 'number', title: 'Final bill amount' },
          incidentalCharges: { type: 'number', title: 'Incidental charges' },
        },
      },
    },
  },
};

const service = createProfileInfraService({
  industryKey: 'travel',
  industryDisplayName: 'Travel',
  schemaTitle: TRAVEL_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Travel Profile schema (Profile-enabled). Used by the Generate Profiles page (Travel industry) to stream sample customer profiles with churn/propensity/NPS/AOV/loyalty/preferences attributes plus Travel Preferences and tenant-subtree travel reservation data.',
  datasetName: TRAVEL_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Travel Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Travel-industry sample profile generation in this lab.',
  dataflowName: TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    {
      source: 'ootb',
      $id: 'https://ns.adobe.com/xdm/mixins/profile/travel-preferences',
      label: 'Travel Preferences',
    },
    {
      source: 'tenantTitlePattern',
      match: /Travel\s*[-–]?\s*Hotel\s*Experience\s*v1/i,
      optional: true,
      label: 'Travel - Hotel Experience v1',
      createIfMissing: {
        title: 'Travel - Hotel Experience v1',
        description:
          'AEP Orchestration Lab — auto-created Profile-class field group for the Travel industry hotel stay lifecycle (booking, check-in, housekeeping, amenities, room service, check-out).',
        properties: TRAVEL_HOTEL_EXPERIENCE_V1_PROPERTIES,
      },
    },
  ],
  tenantSubtreePrefix: 'travel',
});

const TRAVEL_PROFILE_INFRA_STEP_NAMES = service.STEP_NAMES;

async function runTravelProfileInfraStatus(sandbox, token, clientId, orgId) {
  return service.runStatus(sandbox, token, clientId, orgId);
}

async function runTravelProfileInfraStep(sandbox, token, clientId, orgId, stepName) {
  return service.runStep(sandbox, token, clientId, orgId, stepName);
}

async function runTravelProfileInfraEnableProfile(sandbox, token, clientId, orgId) {
  return service.runEnableProfile(sandbox, token, clientId, orgId);
}

module.exports = {
  runTravelProfileInfraStatus,
  runTravelProfileInfraStep,
  runTravelProfileInfraEnableProfile,
  TRAVEL_PROFILE_SCHEMA_TITLE,
  TRAVEL_PROFILE_DATASET_NAME,
  TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
  TRAVEL_PROFILE_INFRA_STEP_NAMES,
};

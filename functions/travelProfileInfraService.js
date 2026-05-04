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

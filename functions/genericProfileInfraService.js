/**
 * AEP Lab "Generic Profile" wizard — thin config wrapper around
 * `profileInfraFactory`. The factory holds all of the heavy lifting (schema
 * shell + base field groups + identity descriptor + Profile-enabled dataset
 * + manual HTTP API flow instructions); this file only declares the per-
 * industry naming.
 *
 * Phase 0 refactor preserves the original public surface 1:1 so
 * `functions/index.js` doesn't need to be touched: the same exported
 * functions (`runGenericProfileInfraStatus`, `runGenericProfileInfraStep`)
 * and constants (`GENERIC_PROFILE_*`) remain available with identical
 * return shapes.
 *
 * Generic intentionally has NO `industryFieldGroups` — the legacy
 * "Customer Analytics" tenant FG is decided separately by the operator
 * (the wizard never auto-creates or attaches it).
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const GENERIC_PROFILE_SCHEMA_TITLE = 'AEP Lab - Generic Profile - Schema';
const GENERIC_PROFILE_DATASET_NAME = 'AEP Lab - Generic Profile - Dataset';
const GENERIC_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Generic Profile - Dataflow';
/**
 * Title of the optional "Customer Analytics" tenant field group. Kept as a
 * constant for any future tooling that may want to surface it; the wizard
 * itself does NOT auto-create or attach this FG.
 */
const GENERIC_PROFILE_FIELD_GROUP_TITLE = 'AEP Lab - Customer Analytics';

const service = createProfileInfraService({
  industryKey: 'generic',
  industryDisplayName: 'Generic',
  schemaTitle: GENERIC_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Generic Profile schema (Profile-enabled). Used by the Generate Profiles page to stream sample customer profiles with churn/propensity/NPS/AOV/loyalty/preferences attributes.',
  datasetName: GENERIC_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Generic Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for sample profile generation in this lab.',
  dataflowName: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [],
  tenantSubtreePrefix: null,
});

const GENERIC_PROFILE_INFRA_STEP_NAMES = service.STEP_NAMES;

async function runGenericProfileInfraStatus(sandbox, token, clientId, orgId) {
  return service.runStatus(sandbox, token, clientId, orgId);
}

async function runGenericProfileInfraStep(sandbox, token, clientId, orgId, stepName) {
  return service.runStep(sandbox, token, clientId, orgId, stepName);
}

async function runGenericProfileInfraEnableProfile(sandbox, token, clientId, orgId) {
  return service.runEnableProfile(sandbox, token, clientId, orgId);
}

module.exports = {
  runGenericProfileInfraStatus,
  runGenericProfileInfraStep,
  runGenericProfileInfraEnableProfile,
  GENERIC_PROFILE_SCHEMA_TITLE,
  GENERIC_PROFILE_DATASET_NAME,
  GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
  GENERIC_PROFILE_FIELD_GROUP_TITLE,
  GENERIC_PROFILE_INFRA_STEP_NAMES,
};

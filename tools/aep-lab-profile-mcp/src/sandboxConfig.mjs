/**
 * Sandbox profile config assessment — mirrors Firestore connection stores and
 * profile-infra status flags used by profileGenerateService / profileUpdateProxy.
 */

import { LAB_INDUSTRY_KEYS } from './industries.mjs';
import { routePrefixForIndustry } from './industryRoutes.mjs';

/** Firestore collection per industry (Admin SDK only; exposed via GET /api/{prefix}-connection). */
export const INDUSTRY_CONNECTION_COLLECTION = {
  generic: 'genericProfileConnections',
  travel: 'travelProfileConnections',
  fsi: 'fsiProfileConnections',
  telecom: 'telecomProfileConnections',
  retail: 'retailProfileConnections',
  media: 'mediaProfileConnections',
  sports: 'sportsProfileConnections',
};

/**
 * Firestore document id for a sandbox within a connection collection.
 * Matches profileConnectionStoreFactory.docIdForSandbox.
 *
 * @param {string} sandbox
 */
export function docIdForSandbox(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$[\]]/g, '_').slice(0, 700);
}

/**
 * @param {string} industry
 */
export function connectionApiPathForIndustry(industry) {
  const prefix = routePrefixForIndustry(industry);
  return prefix ? `/api/${prefix}-connection` : null;
}

/**
 * @param {string} industry
 */
export function infraStatusApiPathForIndustry(industry) {
  const prefix = routePrefixForIndustry(industry);
  return prefix ? `/api/${prefix}-infra/status` : null;
}

/**
 * Extract streaming manifest from GET /api/{industry}-profile-connection body.
 *
 * @param {object | null | undefined} connectionResponse
 */
export function extractConnectionManifest(connectionResponse) {
  const record =
    connectionResponse?.record && typeof connectionResponse.record === 'object'
      ? connectionResponse.record
      : null;
  const streaming =
    record?.streaming && typeof record.streaming === 'object' ? record.streaming : {};
  const infra = record?.infra && typeof record.infra === 'object' ? record.infra : {};

  const url = String(streaming.url || '').trim();
  const flowId = String(streaming.flowId || '').trim();
  const datasetId = String(streaming.datasetId || '').trim();
  const schemaId = String(streaming.schemaId || '').trim();
  const xdmKey = String(streaming.xdmKey || '').trim();

  const missingStreaming = [];
  if (!url) missingStreaming.push('streaming.url');
  if (!flowId) missingStreaming.push('streaming.flowId');
  if (!datasetId) missingStreaming.push('streaming.datasetId');
  if (!schemaId) missingStreaming.push('streaming.schemaId');
  if (!xdmKey) missingStreaming.push('streaming.xdmKey');

  return {
    saved: !!record,
    firestoreCollection: null,
    firestoreDocId: record?.id || null,
    updatedAt: record?.updatedAt || null,
    streaming: {
      url: url || null,
      flowId: flowId || null,
      flowName: streaming.flowName || null,
      datasetId: datasetId || null,
      schemaId: schemaId || null,
      xdmKey: xdmKey || null,
    },
    infra: {
      schemaId: infra.schemaId || null,
      datasetId: infra.datasetId || null,
      schemaMetaAltId: infra.schemaMetaAltId || null,
      profileCoreMixinId: infra.profileCoreMixinId || null,
      datasetName: infra.datasetName || null,
    },
    connectionReady: !!(url && flowId),
    connectionComplete: !!(url && flowId && datasetId && schemaId && xdmKey),
    missingStreaming,
  };
}

/**
 * Derive infra readiness from status-all row or full per-industry status.
 *
 * @param {object | null | undefined} status
 */
export function assessInfraStatus(status) {
  if (!status || typeof status !== 'object') {
    return {
      infraReady: false,
      schemaFound: false,
      schemaInUnion: false,
      datasetFound: false,
      datasetProfileEnabled: false,
      error: 'no status',
    };
  }
  if (status.error) {
    return {
      infraReady: false,
      schemaFound: false,
      schemaInUnion: false,
      datasetFound: false,
      datasetProfileEnabled: false,
      error: String(status.error),
    };
  }

  const schemaFound = !!(status.schemaFound ?? status.ready);
  const schemaInUnion = !!(status.schemaInUnion ?? status.schemaInProfileUnion);
  const datasetFound = !!status.datasetFound;
  const datasetProfileEnabled = !!status.datasetProfileEnabled;
  const infraReady = schemaFound && schemaInUnion && datasetFound && datasetProfileEnabled;

  return {
    infraReady,
    schemaFound,
    schemaInUnion,
    datasetFound,
    datasetProfileEnabled,
    schemaId: status.schemaId || null,
    datasetId: status.datasetId || null,
    ready: status.ready ?? infraReady,
    prepSteps: status.prepSteps || null,
    nextSteps: Array.isArray(status.nextSteps) ? status.nextSteps : null,
    error: null,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.industry
 * @param {string} opts.sandbox
 * @param {object} [opts.infraStatus]
 * @param {object} [opts.connectionResponse]
 */
export function assessIndustrySandboxConfig({ industry, sandbox, infraStatus, connectionResponse }) {
  const infra = assessInfraStatus(infraStatus);
  const connection = extractConnectionManifest(connectionResponse);
  connection.firestoreCollection = INDUSTRY_CONNECTION_COLLECTION[industry] || null;
  if (connection.firestoreDocId == null && sandbox) {
    connection.firestoreDocId = docIdForSandbox(sandbox);
  }

  const ready = infra.infraReady && connection.connectionReady;
  const missingSteps = [];
  let nextAction = null;

  if (infra.error) {
    missingSteps.push('resolve_infra_status_error');
    nextAction = `Check Adobe auth and sandbox "${sandbox}" access, then re-run lab_sandbox_profile_config with refresh true.`;
  } else if (!infra.schemaFound || !infra.datasetFound) {
    missingSteps.push('provision_infra');
    nextAction = `Run lab_provision_profile_infra_step with sandbox ${sandbox}, industry ${industry}, step all_core.`;
  } else if (infra.datasetFound && !infra.datasetProfileEnabled) {
    missingSteps.push('enable_profile_on_dataset');
    nextAction = `Run lab_enable_profile with sandbox ${sandbox}, industry ${industry}.`;
  } else if (infra.schemaFound && !infra.schemaInUnion) {
    missingSteps.push('schema_profile_union');
    nextAction = `Run lab_enable_profile with sandbox ${sandbox}, industry ${industry} (schema not in Profile union).`;
  } else if (infra.infraReady && !connection.connectionReady) {
    missingSteps.push('save_http_streaming_connection');
    nextAction = `Run lab_provision_profile_infra_step with sandbox ${sandbox}, industry ${industry}, step all_core (includes saveConnection), or complete HTTP API dataflow in Profile Viewer wizard.`;
  } else if (infra.infraReady && connection.connectionReady && connection.missingStreaming.length) {
    missingSteps.push('complete_connection_manifest');
    nextAction = `Re-run lab_provision_profile_infra_step step all_core or save missing fields: ${connection.missingStreaming.join(', ')}.`;
  }

  if (ready && !nextAction) {
    nextAction = `Ready — use lab_generate_profile or lab_update_profile for industry ${industry}.`;
  }

  return {
    industry,
    sandbox,
    ready,
    infra,
    connection,
    missingSteps,
    nextAction,
    firestore: {
      collection: connection.firestoreCollection,
      documentId: connection.firestoreDocId,
    },
    labApis: {
      connection: connectionApiPathForIndustry(industry),
      infraStatus: infraStatusApiPathForIndustry(industry),
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.sandbox
 * @param {Record<string, object>} [opts.statusAllIndustries]
 * @param {Record<string, object>} [opts.connectionsByIndustry]
 * @param {string[]} [opts.industryFilter]
 */
export function buildSandboxProfileConfigReport({ sandbox, statusAllIndustries, connectionsByIndustry, industryFilter }) {
  const keys = industryFilter?.length
    ? industryFilter.filter((k) => LAB_INDUSTRY_KEYS.includes(k))
    : [...LAB_INDUSTRY_KEYS];

  const industries = {};
  for (const industry of keys) {
    industries[industry] = assessIndustrySandboxConfig({
      industry,
      sandbox,
      infraStatus: statusAllIndustries?.[industry],
      connectionResponse: connectionsByIndustry?.[industry],
    });
  }

  const readyIndustries = keys.filter((k) => industries[k].ready);
  const notReadyIndustries = keys.filter((k) => !industries[k].ready);

  return {
    sandbox,
    ready: notReadyIndustries.length === 0,
    readyIndustries,
    notReadyIndustries,
    industries,
    summary: {
      total: keys.length,
      readyCount: readyIndustries.length,
      notReadyCount: notReadyIndustries.length,
    },
    onboardingHint:
      notReadyIndustries.length > 0
        ? `Sandbox not fully configured. Start with lab_onboard_sandbox (mode plan) or lab_provision_profile_infra_step step all_core for: ${notReadyIndustries.join(', ')}.`
        : 'All requested industries have infra + saved HTTP streaming connection.',
  };
}

/**
 * Build an onboarding execution plan for Coworker.
 *
 * @param {ReturnType<typeof buildSandboxProfileConfigReport>} report
 * @param {object} [opts]
 * @param {boolean} [opts.execute]
 */
export function buildOnboardingPlan(report, opts = {}) {
  const steps = [];
  for (const industry of report.notReadyIndustries) {
    const assessment = report.industries[industry];
    if (assessment.missingSteps.includes('provision_infra')) {
      steps.push({
        order: steps.length + 1,
        tool: 'lab_provision_profile_infra_step',
        arguments: { sandbox: report.sandbox, industry, step: 'all_core' },
        reason: 'Create schema, dataset, dataflow, and save Firestore connection.',
      });
    }
    if (assessment.missingSteps.includes('enable_profile_on_dataset') || assessment.missingSteps.includes('schema_profile_union')) {
      steps.push({
        order: steps.length + 1,
        tool: 'lab_enable_profile',
        arguments: { sandbox: report.sandbox, industry },
        reason: 'Enable Real-Time Customer Profile on industry dataset.',
      });
    }
    if (
      assessment.missingSteps.includes('save_http_streaming_connection') ||
      assessment.missingSteps.includes('complete_connection_manifest')
    ) {
      steps.push({
        order: steps.length + 1,
        tool: 'lab_provision_profile_infra_step',
        arguments: { sandbox: report.sandbox, industry, step: 'all_core' },
        reason: 'Persist streaming URL, flow ID, dataset/schema IDs to Firestore connection store.',
      });
    }
  }

  steps.push({
    order: steps.length + 1,
    tool: 'lab_sandbox_profile_config',
    arguments: { sandbox: report.sandbox, refresh: true },
    reason: 'Verify all industries report ready after provisioning.',
  });

  return {
    sandbox: report.sandbox,
    mode: opts.execute ? 'execute' : 'plan',
    stepCount: steps.length,
    steps,
    note: opts.execute
      ? 'Executing provisioning steps sequentially — may take several minutes per industry.'
      : 'Plan only. Re-run with mode execute and a single industry to avoid MCP timeout.',
  };
}

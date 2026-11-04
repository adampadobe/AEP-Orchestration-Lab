/**
 * Dual-stream profile generate — generic base + industry overlay.
 * Mirrors Profile Viewer path ownership (industryAttributeMap) and the
 * per-industry fan-out on POST /api/profile/update.
 */

import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { generateProfile, getProfileConnection, lookupProfile } from '../labApiClient.mjs';
import { resolveIndustryForPath } from './attributeOwnership.mjs';

const DUAL_STREAM_INDUSTRIES = LAB_INDUSTRY_KEYS.filter((key) => key !== 'generic');
// Leave headroom for the overlay within the signed continuation's 120-second TTL.
const GENERIC_PERSISTENCE_TIMEOUT_MS = 90_000;
const GENERIC_PERSISTENCE_POLL_INTERVAL_MS = 5_000;
const PROFILE_READ_TIMEOUT_MS = 10_000;

function relativeProfilePath(path) {
  return path.toLowerCase().replace(/^(_demoemea|demoemea|xdm:demoss)\./, '');
}

function flattenExpectedFields(value, path, output = [], exactPaths = false) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenExpectedFields(item, path ? `${path}.${index}` : String(index), output, exactPaths));
  } else if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      flattenExpectedFields(nestedValue, path ? `${path}.${key}` : key, output, exactPaths);
    }
  } else {
    output.push({ path: exactPaths ? path : path.toLowerCase(), value });
  }
  return output;
}

function profileHasExpectedValue(row, expected) {
  if (expected === null || expected === undefined) {
    return row.valueType === 'null' || row.value === '';
  }
  return String(row.value) === String(expected);
}

function hasExpectedCoreIdentity(rows, identityName, expectedValue) {
  const suffix = `.identification.core.${identityName}`;
  return rows.some((row) =>
    typeof row.path === 'string'
      && row.path.toLowerCase().endsWith(suffix)
      && String(row.value) === String(expectedValue));
}

function assessGenericProfileReadback(profile, { email, ecid, datasetId, attributes, exactPaths }) {
  const rows = Array.isArray(profile?.rows) ? profile.rows : [];
  const hints = profile?.profileAccessHints || {};
  const sourceDatasetIds = Array.isArray(hints.sourceDatasetIds) ? hints.sourceDatasetIds : [];
  const expectedFields = flattenExpectedFields(attributes || {}, '', [], exactPaths);
  const missingPaths = expectedFields
    .filter(({ path, value }) => !rows.some((row) =>
      typeof row.path === 'string'
        && (exactPaths ? row.path === path : relativeProfilePath(row.path) === relativeProfilePath(path))
        && profileHasExpectedValue(row, value)))
    .map(({ path }) => path);
  const emailMatches =
    String(profile?.profileEmail || '').trim().toLowerCase() === String(email).trim().toLowerCase()
      && hints.identityMapHasEmail === true
      && hasExpectedCoreIdentity(rows, 'email', email);
  const ecidMatches =
    String(profile?.ecid || '').trim() === String(ecid).trim()
      && hasExpectedCoreIdentity(rows, 'ecid', ecid);
  const datasetMatches = sourceDatasetIds.some(
    (sourceDatasetId) => String(sourceDatasetId).toLowerCase() === String(datasetId).toLowerCase(),
  );
  const missingChecks = [];
  if (profile?.found !== true || rows.length === 0) missingChecks.push('profile_not_persisted');
  if (!emailMatches) missingChecks.push('email_identity_mismatch');
  if (!ecidMatches) missingChecks.push('ecid_identity_mismatch');
  if (missingPaths.length) missingChecks.push('generic_fields_missing');
  if (!datasetMatches) missingChecks.push('generic_dataset_provenance_missing');

  return {
    ready: missingChecks.length === 0,
    ecidIdentityPresent: hints.identityMapHasEcid === true,
    missingChecks,
    missingPaths,
    sourceDatasetIds,
  };
}

function genericPersistenceTimeoutResult({ attempts, startedAt, observations, readErrors }) {
  const emailObservation = observations?.email;
  const ecidObservation = observations?.ecid;
  const emailReady = emailObservation?.ready === true;
  return {
    ready: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    missingChecks: emailReady
      ? ['persistence_window_elapsed']
      : [
          'email_lookup_not_ready',
          ...(emailObservation?.missingChecks || []),
        ],
    missingPaths: emailObservation?.missingPaths || [],
    sourceDatasetIds: [...new Set([
      ...(emailObservation?.sourceDatasetIds || []),
      ...(ecidObservation?.sourceDatasetIds || []),
    ])],
    ecidLookupReady: ecidObservation?.ready === true && ecidObservation?.ecidIdentityPresent === true,
    ...(Object.keys(readErrors || {}).length ? { lastReadErrors: readErrors } : {}),
  };
}

async function waitForGenericProfilePersistence({
  sandbox,
  email,
  ecid,
  datasetId,
  attributes,
  exactPaths = false,
  timeoutMs = GENERIC_PERSISTENCE_TIMEOUT_MS,
  pollIntervalMs = GENERIC_PERSISTENCE_POLL_INTERVAL_MS,
  startedAtMs = Date.now(),
  lookup = lookupProfile,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!String(ecid || '').trim()) {
    return {
      ready: false,
      attempts: 0,
      elapsedMs: 0,
      missingChecks: ['generation_ecid_missing'],
      missingPaths: [],
      sourceDatasetIds: [],
    };
  }

  const startedAt = startedAtMs;
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastObservations = null;
  let lastReadErrors = {};

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return genericPersistenceTimeoutResult({
        attempts,
        startedAt,
        observations: lastObservations,
        readErrors: lastReadErrors,
      });
    }

    attempts += 1;
    const readTimeoutMs = Math.max(1, Math.min(PROFILE_READ_TIMEOUT_MS, remainingMs));
    const [emailResult, ecidResult] = await Promise.all([
      lookup({
        sandbox,
        namespace: 'email',
        identifier: email,
        timeoutMs: readTimeoutMs,
        retries: 0,
      }),
      lookup({
        sandbox,
        namespace: 'ecid',
        identifier: ecid,
        timeoutMs: readTimeoutMs,
        retries: 0,
      }),
    ]);

    const readResults = [
      ['email', emailResult],
      ['ecid', ecidResult],
    ];
    const failedRead = readResults.find(([namespace, result]) =>
      namespace === 'email'
        && !result.ok
        && result.status !== 0
        && !(result.status === 404 && result.data?.code === 'UPS_ENTITY_NOT_FOUND'));
    if (failedRead) {
      const [namespace, result] = failedRead;
      return {
        ready: false,
        attempts,
        elapsedMs: Date.now() - startedAt,
        missingChecks: ['profile_read_failed'],
        missingPaths: [],
        sourceDatasetIds: [],
        error: `${namespace} profile read failed: ${result.error || `HTTP ${result.status}`}.`,
        errorCode: result.data?.code || null,
      };
    }

    lastReadErrors = Object.fromEntries(
      readResults
        .filter(([, result]) => !result.ok)
        .map(([namespace, result]) => [namespace, {
          status: result.status,
          code: result.data?.code || null,
          error: result.error || 'Profile read failed.',
        }]),
    );
    const observations = Object.fromEntries(
      readResults.map(([namespace, result]) => [
        namespace,
        result.ok
          ? assessGenericProfileReadback(result.data, { email, ecid, datasetId, attributes, exactPaths })
          : {
              ready: false,
              missingChecks: ['profile_not_persisted'],
              missingPaths: [],
              sourceDatasetIds: [],
            },
      ]),
    );
    lastObservations = observations;
    if (observations.email.ready && Date.now() <= deadline) {
      return {
        ready: true,
        attempts,
        elapsedMs: Date.now() - startedAt,
        namespacesChecked: ['email', 'ecid'],
        gateNamespace: 'email',
        ecidLookupReady: observations.ecid.ready && observations.ecid.ecidIdentityPresent === true,
        lastReadErrors,
        missingChecks: [],
        missingPaths: [],
        sourceDatasetIds: [...new Set([
          ...observations.email.sourceDatasetIds,
          ...observations.ecid.sourceDatasetIds,
        ])],
      };
    }

    const waitMs = Math.min(pollIntervalMs, deadline - Date.now());
    if (waitMs <= 0) {
      return genericPersistenceTimeoutResult({
        attempts,
        startedAt,
        observations: lastObservations,
        readErrors: lastReadErrors,
      });
    }
    await sleep(waitMs);
  }
}

/**
 * @param {string} industry
 */
export function industryNeedsDualStream(industry) {
  return DUAL_STREAM_INDUSTRIES.includes(industry);
}

/**
 * @param {Record<string, unknown>} attributes
 * @param {string} targetIndustry
 */
export function splitAttributesByIndustry(attributes, targetIndustry) {
  const genericAttrs = {};
  const industryAttrs = {};

  for (const [path, value] of Object.entries(attributes || {})) {
    if (value === undefined) continue;
    const { industry } = resolveIndustryForPath(path);
    const owner = industry || 'generic';
    if (owner === targetIndustry) {
      industryAttrs[path] = value;
    } else {
      genericAttrs[path] = value;
    }
  }

  return { genericAttrs, industryAttrs };
}

/**
 * Ensure generic step carries email identity when callers pass industry-only attrs.
 * @param {Record<string, unknown>} genericAttrs
 * @param {string} email
 */
export function ensureGenericIdentityBase(genericAttrs, email) {
  const out = { ...(genericAttrs || {}) };
  const trimmed = String(email || '').trim();
  if (trimmed && out['personalEmail.address'] == null) {
    out['personalEmail.address'] = trimmed;
  }
  return out;
}

/**
 * Build ordered generate steps for lab_generate_profile / batch worker.
 * @param {{ industry: string, attributes?: Record<string, unknown>, email?: string }} params
 */
export function planDualStreamGenerate({ industry, attributes, email }) {
  const attrs = attributes && typeof attributes === 'object' ? attributes : {};

  if (!industryNeedsDualStream(industry)) {
    return {
      dualStream: false,
      steps: [
        {
          step: 1,
          industry,
          attributes: attrs,
          appendIfExisting: false,
          role: 'single',
        },
      ],
    };
  }

  const { genericAttrs, industryAttrs } = splitAttributesByIndustry(attrs, industry);
  const genericWithIdentity = ensureGenericIdentityBase(genericAttrs, email);
  const steps = [];
  let stepNum = 0;

  if (Object.keys(genericWithIdentity).length > 0) {
    stepNum += 1;
    steps.push({
      step: stepNum,
      industry: 'generic',
      attributes: genericWithIdentity,
      appendIfExisting: false,
      role: 'generic_base',
    });
  }

  if (Object.keys(industryAttrs).length > 0) {
    stepNum += 1;
    steps.push({
      step: stepNum,
      industry,
      attributes: industryAttrs,
      appendIfExisting: true,
      role: 'industry_overlay',
    });
  }

  const genericBaseStep = steps.find((step) => step.role === 'generic_base');
  const industryOverlayStep = steps.find((step) => step.role === 'industry_overlay');
  if (genericBaseStep && industryOverlayStep) {
    genericBaseStep.issueAppendToken = true;
    industryOverlayStep.requiresContinuationToken = true;
  }

  if (steps.length === 0) {
    steps.push({
      step: 1,
      industry,
      attributes: attrs,
      appendIfExisting: false,
      role: 'single',
    });
  }

  return {
    dualStream: steps.length > 1,
    steps,
  };
}

/**
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.sandbox
 * @param {ReturnType<typeof planDualStreamGenerate>} params.plan
 * @param {boolean} [params.test_profile]
 * @param {boolean} [params.append_if_existing]
 * @param {string} [params.correlation_id]
 */
export async function executeGeneratePlan({
  email,
  sandbox,
  plan,
  test_profile,
  append_if_existing,
  correlation_id,
  persistenceTimeoutMs = GENERIC_PERSISTENCE_TIMEOUT_MS,
  persistencePollIntervalMs = GENERIC_PERSISTENCE_POLL_INTERVAL_MS,
}) {
  /** @type {Array<Record<string, unknown>>} */
  const stepResults = [];
  let lastOk = null;
  let ecid = null;
  let continuationToken = null;
  let geoMirror;
  const requiresGenericPersistence =
    plan.steps.some((step) => step.role === 'generic_base')
    && plan.steps.some((step) => step.requiresContinuationToken);
  let genericDatasetId = null;

  if (requiresGenericPersistence) {
    const connectionResult = await getProfileConnection({
      path: '/api/generic-profile-connection',
      sandbox,
      timeoutMs: PROFILE_READ_TIMEOUT_MS,
      retries: 0,
    });
    genericDatasetId = String(connectionResult.data?.record?.streaming?.datasetId || '').trim();
    if (!connectionResult.ok || !genericDatasetId) {
      return {
        ok: false,
        dualStream: plan.dualStream,
        stepResults,
        failedStep: 1,
        errorCode: 'GENERIC_PROFILE_DATASET_UNAVAILABLE',
        error: connectionResult.ok
          ? 'The Generic profile dataset ID is unavailable; no profile stream was sent.'
          : `Could not verify the Generic profile dataset before generation: ${connectionResult.error}`,
        partialSuccess: false,
      };
    }
  }

  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    const appendForStep =
      step.appendIfExisting != null
        ? step.appendIfExisting
        : i > 0
          ? true
          : append_if_existing ?? false;

    if (step.requiresContinuationToken && !continuationToken) {
      return {
        ok: false,
        partialSuccess: true,
        dualStream: plan.dualStream,
        stepResults,
        failedStep: step.step,
        errorCode: 'DUAL_STREAM_CONTINUATION_TOKEN_MISSING',
        error:
          'The generic base profile was accepted, but the deployed profile function did not return a continuation token. ' +
          'The industry overlay was not sent to avoid creating a second ECID. Do not regenerate this identity.',
        data: lastOk?.data,
        ecid,
      };
    }

    const apiResult = await generateProfile({
      email,
      sandbox,
      industry: step.industry,
      attributes: step.attributes,
      append_if_existing: appendForStep,
      test_profile,
      issue_append_token: step.issueAppendToken === true,
      append_token: step.requiresContinuationToken ? continuationToken : undefined,
      correlation_id,
    });

    stepResults.push({
      step: step.step,
      industry: step.industry,
      role: step.role,
      appendIfExisting: appendForStep,
      ok: apiResult.ok,
      attributeCount: Object.keys(step.attributes || {}).length,
      samplePaths: Object.keys(step.attributes || {}).slice(0, 8),
      ecid: apiResult.data?.ecid || null,
      geoMirror: apiResult.data?.geoMirror,
      schemaAlignment: apiResult.data?.schemaAlignment,
      error: apiResult.ok ? undefined : apiResult.error,
    });

    if (!apiResult.ok) {
      return {
        ok: false,
        dualStream: plan.dualStream,
        stepResults,
        failedStep: step.step,
        error: apiResult.error,
        data: apiResult.data,
        ecid,
        partialSuccess: Boolean(lastOk),
      };
    }

    lastOk = apiResult;
    if (step.industry === 'generic' || step.role === 'single') geoMirror = apiResult.data?.geoMirror;
    ecid = apiResult.data?.ecid || ecid;
    continuationToken = apiResult.data?.appendToken || continuationToken;

    const nextStep = plan.steps[i + 1];
    if (step.role === 'generic_base' && nextStep?.requiresContinuationToken && continuationToken) {
      const persistence = await waitForGenericProfilePersistence({
        sandbox,
        email,
        ecid,
        datasetId: genericDatasetId,
        attributes: apiResult.data?.persistenceAttributes || step.attributes,
        exactPaths: Boolean(apiResult.data?.schemaAlignment),
        timeoutMs: persistenceTimeoutMs,
        pollIntervalMs: persistencePollIntervalMs,
        startedAtMs: Date.now(),
      });
      stepResults.at(-1).persistence = {
        ready: persistence.ready,
        attempts: persistence.attempts,
        elapsedMs: persistence.elapsedMs,
        namespacesChecked: persistence.namespacesChecked || ['email', 'ecid'],
        missingChecks: persistence.missingChecks,
        missingPaths: persistence.missingPaths,
        sourceDatasetIds: persistence.sourceDatasetIds,
        gateNamespace: 'email',
        ecidLookupReady: persistence.ecidLookupReady === true,
        lastReadErrors: persistence.lastReadErrors,
      };
      if (!persistence.ready) {
        return {
          ok: false,
          partialSuccess: true,
          dualStream: plan.dualStream,
          stepResults,
          failedStep: nextStep.step,
          errorCode: persistence.errorCode || 'GENERIC_PROFILE_PERSISTENCE_TIMEOUT',
          error: persistence.error
            || 'The Generic base was accepted but did not become verifiably persistent before the timeout. ' +
              'The industry overlay was not sent. Do not regenerate this identity.',
          data: apiResult.data,
          ecid,
        };
      }
    }
  }

  return {
    ok: true,
    dualStream: plan.dualStream,
    stepResults,
    data: { ...lastOk?.data, ...(geoMirror ? { geoMirror } : {}) },
    ecid: lastOk?.data?.ecid || ecid,
  };
}

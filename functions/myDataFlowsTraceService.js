'use strict';

const { bindings } = require('./myDataFlowsRegistry');
const INDUSTRIES = ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (status, message) => Object.assign(new Error(message), { status, tracePublic: true });
const nodeIds = {
  source: ['lab', 'base', 'crm'], rel: ['rel'],
  ingestion: ['xdm-flow', 'rel-flow'], aepProfile: ['profile'],
  aepXdm: ['xdm-profile', 'xdm-events', 'query'], aepRel: ['rel-datasets', 'query'],
};
const labels = {
  source: 'Snowflake source', rel: 'Snowflake REL', ingestion: 'Scheduled ingestion',
  aepProfile: 'AEP Profile', aepXdm: 'AEP XDM storage', aepRel: 'AEP REL storage',
};
function stage(id, value = {}, stamp) {
  return {
    id, label: labels[id], nodeIds: nodeIds[id], state: 'waiting',
    detail: 'Waiting for the source creation receipt.', evidence: {}, queries: [], links: [],
    ...value, checkedAt: stamp || null,
    verifiedAt: value.state === 'verified' ? stamp : null,
  };
}
function publicRun(run) {
  if (!run) return null;
  const { expected, checkLeaseUntil, ...result } = run;
  // Older durable receipts predate the structured unsupported-check flag.
  if (Array.isArray(result.stages)) result.stages = result.stages.map((value) =>
    !value.verification && ['aepXdm', 'aepRel'].includes(value.id) && value.state === 'unavailable'
      && value.detail?.startsWith('Automatic dataset row readback is not supported')
      ? { ...value, verification: 'manual' } : value);
  return result;
}
function validateId(id) {
  if (!UUID.test(id)) throw fail(400, 'A valid trace request ID is required.');
}
function relevantBindings(industry) {
  return bindings.filter(({ table }) => table === 'REL.RECIPIENT'
    || table === 'AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE'
    || table.startsWith(`REL.REL_${industry.toUpperCase()}_`)
    || table.startsWith(`AEP_SCHEMA.AGENTIC_${industry.toUpperCase()}_`));
}
function datasetTemplates(flows, identity, relational) {
  const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const unique = new Map();
  for (const flow of flows) {
    if (flow.sourceTables.some((table) => table.startsWith('REL.')) !== relational) continue;
    for (const dataset of flow.datasets) unique.set(dataset.id, dataset);
  }
  return [...unique.values()].map((dataset) => ({
    label: `${dataset.name} — Query Service template (replace placeholders)`,
    text: `-- Dataset ${dataset.id}: ${String(dataset.name).replace(/[\r\n]/g, ' ')}\n`
      + '-- Replace the table and mapped-field placeholders using this dataset schema.\n'
      + '-- This template has NOT been executed. Flow success is not row-level proof.\n'
      + `SELECT * FROM "<Query Service table for dataset ${dataset.id}>"\n`
      + `WHERE "<mapped ${relational ? 'recipient_id' : 'email'} field>" = `
      + `${literal(relational ? identity.recipientId : identity.email)}\nLIMIT 10;`,
  }));
}

function snowflakeQueries(queries, identity) {
  return (queries || []).map((query) => {
    let parameter = 0;
    return {
      label: `${query.table} — identity-filtered read`,
      text: query.sql.replace(/\?/g, () => {
        const key = query.parameters[parameter++];
        const value = key?.startsWith('identity.') ? identity[key.slice(9)] : null;
        if (typeof value !== 'string') throw new Error('Snowflake query has an unsupported identity binding.');
        return `'${value.replaceAll("'", "''")}'`;
      }),
    };
  });
}

function createMyDataFlowsTraceService({
  store, snowflake, aep, getPrefs, flowSnapshot, now = () => new Date(), logger = console,
}) {
  async function prefs(uid) {
    const saved = await getPrefs(uid, 'apalmer');
    return {
      ready: !!saved.baseEmail && /^\+[1-9]\d{6,14}$/.test(saved.mobilePhone || ''),
      settingsHref: 'profile-generation.html',
    };
  }
  async function create(uid, industry, id) {
    validateId(id);
    if (!INDUSTRIES.includes(industry)) throw fail(400, 'Choose one of the six supported industries.');
    const existing = await store.get(uid, id);
    if (existing) {
      if (existing.industry !== industry) throw fail(409, 'This request belongs to a different industry.');
      return publicRun(existing);
    }
    const ready = await snowflake.preflight({ uid, industry });
    if (!ready?.ready) throw fail(400, 'Snowflake or generation settings are not ready. Check the existing generator settings.');
    const stamp = now().toISOString();
    const reservation = await store.reserve(uid, {
      id, industry, sandbox: 'apalmer', createdAt: stamp, updatedAt: stamp,
      state: 'creating', identity: null, expected: { mobilePhone: ready.mobilePhone },
      stages: Object.keys(labels).map((key) => stage(key)),
      limitations: [
        'One test recipient and linked industry sample data. No direct AEP stream, campaign send, flow repair or replay.',
        'Scheduled ingestion continues independently when watching is stopped.',
        'Dataset-level AEP storage is not automatically queryable by the current REST integration.',
      ],
    });
    if (!reservation.created) return publicRun(reservation.run);
    let prepared = false;
    try {
      const result = await snowflake.generate({
        uid, industry, expectedBaseEmail: ready.baseEmail, expectedMobilePhone: ready.mobilePhone,
        onPrepared: async (plan) => {
          if (prepared || plan.profiles?.length !== 1) throw new Error('Generation did not prepare exactly one identity.');
          if (plan.mobilePhone && plan.mobilePhone !== ready.mobilePhone) throw new Error('Saved mobile changed after preflight.');
          const identity = plan.profiles[0];
          if (!identity.email || !identity.ecid || !identity.crmId || !identity.recipientId) {
            throw new Error('Generation did not return the full identity.');
          }
          await store.update(uid, id, {
            identity: { email: identity.email, ecid: identity.ecid, crmId: identity.crmId, recipientId: identity.recipientId },
            expected: { mobilePhone: plan.mobilePhone || ready.mobilePhone },
            generation: { state: 'prepared', detail: 'Identity reserved before source writes; not yet a commit receipt.' },
          });
          prepared = true;
        },
      });
      if (!prepared) throw new Error('Generation omitted its durable identity callback.');
      const success = result?.ok === true;
      return publicRun(await store.update(uid, id, {
        state: success ? 'watching' : 'needs_attention',
        generation: {
          state: success ? 'committed' : result?.committed ? 'committed_needs_inspection' : 'unknown',
          detail: success
            ? 'The generator reported a committed source write. Check stored rows below.'
            : 'Creation did not return a fully verified receipt. Inspect the same identity; do not generate or retry automatically.',
        },
      }));
    } catch (error) {
      logger.error('[my-data-flows-trace] Creation needs inspection', { code: error.code || 'unknown', prepared });
      return publicRun(await store.update(uid, id, {
        state: 'needs_attention',
        generation: { state: 'unknown', detail: 'Creation was interrupted or failed. Its outcome is not confirmed. Resume this receipt; no automatic retry is allowed.' },
      }));
    }
  }
  async function read(uid, id, refresh = false) {
    if (id) validateId(id);
    let run = await store.get(uid, id);
    if (!run) return null;
    if (!refresh) return publicRun(run);
    if (run.state === 'creating' && now().getTime() - Date.parse(run.createdAt) > 360_000) {
      run = await store.update(uid, run.id, {
        state: 'needs_attention',
        generation: { state: 'unknown', detail: 'The creation request no longer has a current receipt. Inspect its reserved identity; never replay generation automatically.' },
      });
    }
    const claimed = await store.claimCheck(uid, run.id);
    if (!claimed) return publicRun(run);
    run = claimed;
    const stamp = now().toISOString();
    const stages = new Map(run.stages.map((value) => [value.id, value]));
    const unavailable = (id, detail) => stage(id, { state: 'unavailable', detail }, stamp);
    const report = (section, error) =>
      logger.warn('[my-data-flows-trace] Read unavailable', { section, code: error.code || 'unavailable' });
    try {
      await Promise.all([
        (async () => {
          try {
            const result = await snowflake.inspect({ uid, industry: run.industry, identity: run.identity });
            for (const key of ['source', 'rel']) {
              stages.set(key, stage(key, {
                ...result[key], queries: snowflakeQueries(result[key].queries, run.identity),
              }, stamp));
            }
          } catch (error) {
            report('snowflake', error);
            for (const key of ['source', 'rel']) stages.set(key, unavailable(key,
              'Snowflake readback is unavailable. Check the saved connection and readiness; no data was repaired.'));
          }
        })(),
        (async () => {
          try {
            stages.set('aepProfile', stage('aepProfile', {
              ...await aep.inspect(run.identity, run.expected),
              links: [{ label: 'Open Profile viewer', href: 'profile.html' }],
            }, stamp));
          } catch (error) {
            report('profile', error);
            stages.set('aepProfile', unavailable('aepProfile', 'AEP Profile readback is unavailable. Absence or successful ingestion is not confirmed.'));
          }
        })(),
        (async () => {
          let flows = [];
          try {
            const snapshot = await flowSnapshot(run.industry);
            flows = snapshot.flows;
            const failed = flows.some((flow) => flow.state !== 'enabled' || flow.lastRun?.failedCount > 0
              || /fail|error|cancel/i.test(flow.lastRun?.state || ''));
            stages.set('ingestion', stage('ingestion', {
              state: !snapshot.complete ? 'unavailable' : failed ? 'failed' : 'waiting',
              detail: 'Configured flows run independently, generally every 15 minutes. Latest-run metadata below is not proof that this person transferred.',
              evidence: { complete: snapshot.complete, flows, limitations: snapshot.limitations },
            }, stamp));
          } catch (error) {
            report('flows', error);
            stages.set('ingestion', unavailable('ingestion', 'Flow status is unavailable; this does not establish whether the person was ingested.'));
          }
          for (const [key, relational] of [['aepXdm', false], ['aepRel', true]]) {
            stages.set(key, stage(key, {
              state: 'unavailable',
              verification: 'manual',
              detail: 'Automatic dataset row readback is not supported by the current AEP REST integration. Use the exact destination dataset below in Query Service; replace the marked query placeholders. Profile visibility and flow success are not substitutes.',
              evidence: { datasets: [...new Map(flows
                .filter((flow) => flow.sourceTables.some((table) => table.startsWith('REL.')) === relational)
                .flatMap((flow) => flow.datasets).map((dataset) => [dataset.id, dataset])).values()] },
              queries: datasetTemplates(flows, run.identity, relational),
            }, stamp));
          }
        })(),
      ]);
      return publicRun(await store.update(uid, run.id, {
        stages: [...stages.values()], lastCheckedAt: stamp,
        checkLeaseUntil: now().getTime() + 25_000,
      }));
    } catch (error) {
      // Leave the lease in place on receipt persistence failure; never report unstored evidence.
      report('receipt', error);
      throw fail(503, 'Readback could not be saved. Resume the same trace; do not create another profile.');
    }
  }
  return { prefs, create, read };
}

module.exports = { createMyDataFlowsTraceService, relevantBindings, publicRun, datasetTemplates, UUID };

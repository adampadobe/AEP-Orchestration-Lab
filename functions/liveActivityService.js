'use strict';

const { createHash, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const liveActivityCore = require('./liveActivityCore');

const PREFLIGHT_COLLECTION = 'liveActivityPreflights';
const EXECUTION_COLLECTION = 'liveActivityExecutions';
const AUDIT_COLLECTION = 'liveActivityAuditLog';
const PREFLIGHT_TTL_MS = 10 * 60 * 1000;
const AJO_UNITARY_EXECUTIONS_URL = 'https://platform.adobe.io/ajo/im/executions/unitary';

let db;
function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  if (!db) db = admin.firestore();
  return db;
}

function safeId(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function executionDocId(uid, sandbox, idempotencyKey) {
  return createHash('sha256')
    .update(`${uid}:${sandbox}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 48);
}

async function writeAudit(entry) {
  const record = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...entry,
  };
  console.log(JSON.stringify({
    type: 'aep-lab-live-activity-audit',
    timestamp: new Date().toISOString(),
    ...entry,
  }));
  await getDb().collection(AUDIT_COLLECTION).add(record).catch((e) => {
    console.warn('[liveActivity] audit persistence failed:', e.message || e);
  });
}

async function purgeExpiredPreflights() {
  try {
    const expired = await getDb().collection(PREFLIGHT_COLLECTION)
      .where('expiresAt', '<=', admin.firestore.Timestamp.now())
      .limit(25)
      .get();
    if (expired.empty) return;
    const batch = getDb().batch();
    expired.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (e) {
    console.warn('[liveActivity] expired preflight cleanup failed:', e.message || e);
  }
}

async function createPreflight({ uid, sandbox, template, input, principalEmail, keyId }) {
  await purgeExpiredPreflights();
  const built = liveActivityCore.buildExecutionPayload({
    templateBody: template.body,
    variableDefinitions: template.variableDefinitions,
    input,
  });
  if (!built.ready) {
    return {
      ready: false,
      sandbox,
      template: {
        id: template.id,
        name: template.name,
        customer: template.customer,
        variableDefinitions: template.variableDefinitions || [],
      },
      missingFields: built.missingFields,
      coworkerInstruction:
        'Ask the colleague only for missingFields, then call lab_live_activity_preflight again. Do not send yet.',
    };
  }

  const preflightId = randomUUID();
  const expiresAtMs = Date.now() + PREFLIGHT_TTL_MS;
  const record = {
    preflightId,
    principalUid: safeId(uid, 128),
    principalEmail: safeId(principalEmail, 160) || null,
    keyId: safeId(keyId, 40) || null,
    sandbox,
    templateId: template.id,
    templateName: template.name,
    customer: template.customer,
    templateVersion: template.version || 1,
    payloadHash: built.payloadHash,
    payload: built.payload,
    status: 'ready',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
  };
  await getDb().collection(PREFLIGHT_COLLECTION).doc(preflightId).set(record);
  await writeAudit({
    action: 'preflight',
    principalUid: safeId(uid, 128),
    keyId: safeId(keyId, 40) || null,
    sandbox,
    templateId: template.id,
    campaignId: built.payload.campaignId,
    event: built.payload.recipients[0].context.requestPayload.aps.event,
    payloadHash: built.payloadHash,
    result: 'ready',
  });
  return {
    ready: true,
    preflightId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    sandbox,
    template: {
      id: template.id,
      name: template.name,
      customer: template.customer,
      version: template.version || 1,
    },
    summary: {
      campaignId: built.payload.campaignId,
      recipientEcid: liveActivityCore.maskEcid(built.payload.recipients[0].userId),
      event: built.payload.recipients[0].context.requestPayload.aps.event,
      liveActivityId:
        built.payload.recipients[0].context.requestPayload.aps.attributes.liveActivityData.liveActivityID,
      payloadHash: built.payloadHash,
    },
    preview: liveActivityCore.previewPayload(built.payload),
    coworkerInstruction:
      'Show this summary to the colleague and ask for explicit confirmation. Then call lab_live_activity_send with confirmed=true and this preflight_id.',
  };
}

async function sendPreflight({
  uid,
  sandbox,
  preflightId,
  confirmed,
  idempotencyKey,
  keyId,
  getAdobeAccessToken,
  clientId,
  imsOrg,
}) {
  if (confirmed !== true) {
    throw Object.assign(new Error('explicit confirmed=true is required before sending a Live Activity'), {
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    });
  }
  const preflightRef = getDb().collection(PREFLIGHT_COLLECTION).doc(safeId(preflightId, 80));
  const preflightSnap = await preflightRef.get();
  if (!preflightSnap.exists) {
    throw Object.assign(new Error('preflight not found; run preflight again'), { status: 404 });
  }
  const preflight = preflightSnap.data() || {};
  if (preflight.principalUid !== uid || preflight.sandbox !== sandbox) {
    throw Object.assign(new Error('preflight does not belong to this principal and sandbox'), { status: 403 });
  }
  const expiresAtMs = preflight.expiresAt?.toMillis
    ? preflight.expiresAt.toMillis()
    : Date.parse(preflight.expiresAt || '');
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw Object.assign(new Error('preflight expired; run preflight again'), { status: 409 });
  }
  if (preflight.status !== 'ready') {
    throw Object.assign(new Error(`preflight is ${preflight.status || 'not ready'}`), { status: 409 });
  }
  const payloadJson = JSON.stringify(preflight.payload);
  const currentHash = createHash('sha256').update(payloadJson).digest('hex');
  if (currentHash !== preflight.payloadHash) {
    throw Object.assign(new Error('preflight payload integrity check failed'), { status: 409 });
  }

  const idem = safeId(idempotencyKey || preflightId, 160);
  const executionRef = getDb()
    .collection(EXECUTION_COLLECTION)
    .doc(executionDocId(uid, sandbox, idem));
  try {
    await executionRef.create({
      principalUid: uid,
      sandbox,
      preflightId,
      idempotencyKey: idem,
      payloadHash: preflight.payloadHash,
      templateId: preflight.templateId,
      status: 'sending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (Number(e?.code) === 6 || String(e?.code) === '6' || String(e?.message || '').includes('ALREADY_EXISTS')) {
      const duplicate = await executionRef.get();
      const row = duplicate.data() || {};
      return {
        ok: row.status === 'sent',
        duplicate: true,
        status: row.ajoStatus || null,
        executionStatus: row.status || null,
        requestId: row.requestId || null,
        preflightId: row.preflightId || preflightId,
        templateId: row.templateId || preflight.templateId,
        campaignId: row.campaignId || preflight.payload.campaignId,
        event: row.event || preflight.payload.recipients[0].context.requestPayload.aps.event,
        payloadHash: row.payloadHash || preflight.payloadHash,
      };
    }
    throw e;
  }

  let upstream;
  let platformResponse;
  try {
    const accessToken = await getAdobeAccessToken();
    upstream = await fetch(AJO_UNITARY_EXECUTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-gw-ims-org-id': safeId(imsOrg, 512),
        'x-api-key': safeId(clientId, 256),
        'x-sandbox-name': sandbox,
        Authorization: `Bearer ${accessToken}`,
      },
      body: payloadJson,
    });
    const text = await upstream.text();
    try {
      platformResponse = text ? JSON.parse(text) : {};
    } catch {
      platformResponse = { raw: text.slice(0, 20_000) };
    }
  } catch (e) {
    await executionRef.set({
      status: 'failed',
      error: safeId(e.message || e, 2000),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAudit({
      action: 'send',
      principalUid: uid,
      keyId: safeId(keyId, 40) || null,
      sandbox,
      templateId: preflight.templateId,
      payloadHash: preflight.payloadHash,
      result: 'error',
      error: safeId(e.message || e, 500),
    });
    throw Object.assign(new Error(`AJO request failed: ${e.message || e}`), { status: 502 });
  }

  const safePlatformResponse = platformResponse && typeof platformResponse === 'object'
    ? platformResponse
    : {};
  const result = {
    ok: upstream.ok,
    duplicate: false,
    status: upstream.status,
    requestId: preflight.payload.requestId,
    preflightId,
    templateId: preflight.templateId,
    customer: preflight.customer,
    campaignId: preflight.payload.campaignId,
    event: preflight.payload.recipients[0].context.requestPayload.aps.event,
    payloadHash: preflight.payloadHash,
    platformResponse: safePlatformResponse,
  };
  await executionRef.set({
    ...result,
    ajoStatus: upstream.status,
    status: upstream.ok ? 'sent' : 'rejected',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await preflightRef.set({
    status: upstream.ok ? 'sent' : 'rejected',
    executionId: executionRef.id,
    payload: admin.firestore.FieldValue.delete(),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAudit({
    action: 'send',
    principalUid: uid,
    keyId: safeId(keyId, 40) || null,
    sandbox,
    templateId: preflight.templateId,
    campaignId: preflight.payload.campaignId,
    event: result.event,
    payloadHash: preflight.payloadHash,
    ajoStatus: upstream.status,
    result: upstream.ok ? 'ok' : 'error',
  });
  return result;
}

async function listRuns(uid, sandbox, limitInput = 20) {
  const limit = Math.max(1, Math.min(50, Number(limitInput) || 20));
  const snap = await getDb().collection(EXECUTION_COLLECTION)
    .where('principalUid', '==', uid)
    .limit(200)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.sandbox === sandbox)
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      status: row.status,
      templateId: row.templateId,
      customer: row.customer || null,
      campaignId: row.campaignId || null,
      event: row.event || null,
      requestId: row.requestId || null,
      preflightId: row.preflightId || null,
      ajoStatus: row.status === 'sent' || row.status === 'rejected' ? row.status : row.ajoStatus || null,
      createdAt: row.createdAt?.toDate ? row.createdAt.toDate().toISOString() : null,
    }));
}

module.exports = {
  PREFLIGHT_COLLECTION,
  EXECUTION_COLLECTION,
  AUDIT_COLLECTION,
  PREFLIGHT_TTL_MS,
  AJO_UNITARY_EXECUTIONS_URL,
  createPreflight,
  sendPreflight,
  listRuns,
};

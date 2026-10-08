'use strict';

/**
 * Demo Asset Library hardening: per-user daily Gemini budget and an audit log
 * of every mutating request. Firestore (Admin SDK only):
 *
 *   demoAssetUsage/{yyyymmdd}_{emailKey}  { email, day, count, byKind, updatedAt }
 *   demoAssetAudit/{auto}                 { action, assetId, flowId, email, uid, at, detail }
 *
 * The budget wraps callGemini, so every Gemini call (classify, studio chat,
 * flow suggest) is counted in one place. Classification falls back to
 * heuristics when the budget is spent; chat/suggest return 429.
 */

const admin = require('firebase-admin');
const base = require('./demoAssetsService');

const USAGE_COLLECTION = 'demoAssetUsage';
const AUDIT_COLLECTION = 'demoAssetAudit';
const DEFAULT_DAILY_LIMIT = 80;
const PRO_WEIGHT = 4;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
    this.code = 'BUDGET_EXCEEDED';
  }
}

function dailyLimit() {
  const n = Number(process.env.DEMO_ASSETS_DAILY_GEMINI_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function emailKey(email) {
  return String(email || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 120);
}

/** Pro calls cost more than Flash calls against the same daily allowance. */
function callWeight(opts) {
  return opts && /pro/i.test(String(opts.model || '')) ? PRO_WEIGHT : 1;
}

function createGuard({ getDb = () => base._internal.getDb(), now = () => new Date(), limit = dailyLimit } = {}) {
  function usageRef(user) {
    return getDb().collection(USAGE_COLLECTION).doc(`${dayKey(now())}_${emailKey(user.email)}`);
  }

  async function getUsage(user) {
    const snap = await usageRef(user).get();
    const used = snap.exists ? Number(snap.data().count) || 0 : 0;
    const max = limit();
    return { used, limit: max, remaining: Math.max(0, max - used), day: dayKey(now()), proWeight: PRO_WEIGHT };
  }

  async function consume(user, kind, weight) {
    const ref = usageRef(user);
    const max = limit();
    return getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const used = Number(data.count) || 0;
      if (used + weight > max) {
        throw new BudgetExceededError(`Daily Gemini budget reached (${used}/${max}). It resets at 00:00 UTC.`);
      }
      const byKind = { ...(data.byKind || {}) };
      byKind[kind] = (Number(byKind[kind]) || 0) + weight;
      tx.set(ref, {
        email: String(user.email || '').toLowerCase(),
        day: dayKey(now()),
        count: used + weight,
        byKind,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { used: used + weight, limit: max };
    });
  }

  /** Wrap callGemini so each call is charged to the user before it runs. */
  function budgetedGemini(callGemini, user, kind) {
    if (!callGemini) return callGemini;
    return async (system, prompt, opts) => {
      await consume(user, kind, callWeight(opts));
      return callGemini(system, prompt, opts);
    };
  }

  async function audit(user, action, detail = {}) {
    const { assetId, flowId, ...rest } = detail;
    try {
      await getDb().collection(AUDIT_COLLECTION).doc().set({
        action,
        assetId: assetId || null,
        flowId: flowId || null,
        email: user.email,
        uid: user.uid,
        detail: rest,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // The mutation already succeeded; never report it as failed because the log write did.
      console.error('[demoAssetsAudit] write failed', action, e);
    }
  }

  async function listAudit({ assetId, flowId, limit: max } = {}) {
    let q = getDb().collection(AUDIT_COLLECTION);
    if (assetId) {
      if (!ID_RE.test(assetId)) throw new base.DemoAssetsError(400, 'Invalid asset id');
      q = q.where('assetId', '==', assetId);
    } else if (flowId) {
      if (!ID_RE.test(flowId)) throw new base.DemoAssetsError(400, 'Invalid flow id');
      q = q.where('flowId', '==', flowId);
    }
    const n = Math.min(Math.max(Number(max) || 50, 1), 200);
    // Filtered queries sort in memory so no composite index is required.
    const snap = assetId || flowId ? await q.limit(500).get() : await q.orderBy('at', 'desc').limit(n).get();
    const atMs = (x) => (x && x.toMillis ? x.toMillis() : 0);
    const docs = assetId || flowId
      ? snap.docs.slice().sort((a, b) => atMs(b.data().at) - atMs(a.data().at)).slice(0, n)
      : snap.docs;
    return docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        action: x.action,
        assetId: x.assetId || null,
        flowId: x.flowId || null,
        email: x.email || '',
        detail: x.detail || {},
        at: x.at && x.at.toDate ? x.at.toDate().toISOString() : x.at || null,
      };
    });
  }

  return { getUsage, consume, budgetedGemini, audit, listAudit };
}

const defaultGuard = createGuard();

module.exports = {
  ...defaultGuard,
  createGuard,
  BudgetExceededError,
  callWeight,
  dayKey,
  emailKey,
  USAGE_COLLECTION,
  AUDIT_COLLECTION,
  DEFAULT_DAILY_LIMIT,
  PRO_WEIGHT,
};

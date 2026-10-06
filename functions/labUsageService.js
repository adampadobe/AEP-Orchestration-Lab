'use strict';

const OWNER_EMAIL = 'apalmer@adobe.com';
const DIRECTORY_LIMIT = 1000;
const AUDIT_LIMIT = 5000;
const DAY_MS = 86400000;
const KEY_FIELDS = ['principalUid', 'revoked', 'createdAt', 'lastUsedAt'];
const AUDIT_FIELDS = ['timestamp', 'keyId', 'tool', 'result', 'durationMs'];
const { readTelemetry, summarizeTelemetry } = require('./labUsageTelemetry');
const { readInvocations, summarizeInvocations } = require('./labUsageInvocations');
const { summarizeEngagement } = require('./labUsageEngagement');

function isoDate(value) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value || NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function requireUsageOwner(req, auth) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers?.authorization || ''));
  if (!match) return { status: 401, error: 'Firebase sign-in is required.' };
  let claims;
  try {
    claims = await auth.verifyIdToken(match[1], true);
  } catch (error) {
    if ([
      'auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token',
      'auth/argument-error', 'auth/invalid-argument', 'auth/user-disabled',
      'auth/user-not-found', 'auth/tenant-id-mismatch',
    ].includes(error.code)) {
      return { status: 401, error: 'Your sign-in has expired or is invalid. Sign in again.' };
    }
    throw error;
  }
  // This lab's password account is intentionally unverified; bind ownership to its current Auth UID.
  if (claims.email !== OWNER_EMAIL || claims.firebase?.sign_in_provider === 'anonymous') {
    return { status: 403, error: 'Usage statistics are available only to the lab owner.' };
  }
  const owner = await auth.getUserByEmail(OWNER_EMAIL);
  if (owner.uid !== claims.uid || owner.disabled) {
    return { status: 403, error: 'Usage statistics are available only to the lab owner.' };
  }
  return { uid: owner.uid };
}

function summarizeUsage({ userRecords, keyRecords, auditRecords, now, days, truncated }) {
  const startMs = now.getTime() - days * DAY_MS;
  const usersByUid = new Map();
  let accountsWithoutEmail = 0;
  for (const record of userRecords) {
    if (!record.email) {
      accountsWithoutEmail += 1;
      continue;
    }
    usersByUid.set(record.uid, {
      uid: record.uid,
      email: record.email,
      name: record.displayName || '',
      disabled: !!record.disabled,
      createdAt: isoDate(record.metadata?.creationTime),
      lastSignInAt: isoDate(record.metadata?.lastSignInTime),
      activeKeys: 0,
      revokedKeys: 0,
      lastKeyUseAt: null,
      observedMcpEvents: 0,
      lastObservedMcpAt: null,
    });
  }
  const keyOwners = new Map();
  let activeKeys = 0;
  let revokedKeys = 0;
  for (const record of keyRecords) {
    if (record.revoked === false) activeKeys += 1;
    else if (record.revoked === true) revokedKeys += 1;
    const user = usersByUid.get(record.principalUid);
    if (!user) continue;
    keyOwners.set(record.id, user.uid);
    if (record.revoked === false) user.activeKeys += 1;
    else if (record.revoked === true) user.revokedKeys += 1;
    const lastUsedAt = isoDate(record.lastUsedAt);
    if (lastUsedAt && (!user.lastKeyUseAt || lastUsedAt > user.lastKeyUseAt)) {
      user.lastKeyUseAt = lastUsedAt;
    }
  }

  const tools = new Map();
  const daily = new Map();
  const hours = Array.from({ length: 7 }, () => Array(24).fill(0));
  let unattributedEvents = 0;
  let observedEvents = 0;
  let errors = 0;
  let firstEventAt = null;
  let lastEventAt = null;
  for (const record of auditRecords) {
    const timestamp = isoDate(record.timestamp);
    if (!timestamp || Date.parse(timestamp) < startMs || Date.parse(timestamp) > now.getTime()) continue;
    observedEvents += 1;
    if (!firstEventAt || timestamp < firstEventAt) firstEventAt = timestamp;
    if (!lastEventAt || timestamp > lastEventAt) lastEventAt = timestamp;
    const date = new Date(timestamp);
    hours[date.getUTCDay()][date.getUTCHours()] += 1;
    const day = timestamp.slice(0, 10);
    daily.set(day, (daily.get(day) || 0) + 1);
    const name = typeof record.tool === 'string' && /^lab_[a-z0-9_]{1,120}$/.test(record.tool)
      ? record.tool : 'Unclassified tool';
    if (!tools.has(name)) tools.set(name, { name, events: 0, errors: 0, unknownResults: 0, timedEvents: 0, totalDurationMs: 0 });
    const tool = tools.get(name);
    tool.events += 1;
    if (record.result === 'error') {
      errors += 1;
      tool.errors += 1;
    } else if (record.result !== 'ok') {
      tool.unknownResults += 1;
    }
    if (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      tool.timedEvents += 1;
      tool.totalDurationMs += record.durationMs;
    }
    const user = usersByUid.get(keyOwners.get(record.keyId));
    if (user) {
      user.observedMcpEvents += 1;
      if (!user.lastObservedMcpAt || timestamp > user.lastObservedMcpAt) user.lastObservedMcpAt = timestamp;
    } else {
      unattributedEvents += 1;
    }
  }
  const users = [...usersByUid.values()].sort((a, b) =>
    b.observedMcpEvents - a.observedMcpEvents || a.email.localeCompare(b.email));
  return {
    generatedAt: now.toISOString(),
    period: { days, start: new Date(startMs).toISOString(), end: now.toISOString(), timezone: 'UTC' },
    summary: {
      registeredUsers: users.length,
      accountsWithoutEmail,
      usersWithRecentSignIn: users.filter((user) => user.lastSignInAt && Date.parse(user.lastSignInAt) >= startMs).length,
      keyOwners: users.filter((user) => user.activeKeys + user.revokedKeys > 0).length,
      activeKeys,
      revokedKeys,
      observedMcpEvents: observedEvents,
      observedMcpUsers: users.filter((user) => user.observedMcpEvents > 0).length,
      unattributedEvents,
      observedErrors: errors,
    },
    users,
    tools: [...tools.values()].map(({ totalDurationMs, ...tool }) => ({
      ...tool,
      averageDurationMs: tool.timedEvents ? Math.round(totalDurationMs / tool.timedEvents) : null,
    })).sort((a, b) => b.events - a.events || a.name.localeCompare(b.name)),
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, events]) => ({ date, events })),
    hours,
    coverage: {
      ...truncated,
      limits: { users: DIRECTORY_LIMIT, keys: DIRECTORY_LIMIT, auditEvents: AUDIT_LIMIT },
      firstEventAt,
      lastEventAt,
      auditCompleteness: 'partial',
      pageViews: 'not_collected',
      loginHistory: 'not_collected',
      engagement: 'not_collected',
      notices: [
        'Firebase last sign-in is a current account snapshot, not a login history.',
        'MCP figures count observed audit records, not unique tool calls. Some tools log before completion or emit multiple records.',
        'Shared keys, IMS identities without a key-owner mapping, deleted keys and missing directory users remain unattributed.',
        'Only available Firestore MCP audit records are included; Cloud Logging history and persistence failures are not reconstructed.',
        'Page views, sessions and active time are not yet collected. Missing data is not zero usage.',
      ],
    },
  };
}

async function getUsageSnapshot({ auth, db, days, now = new Date(), telemetryCollectionEnabled = false, excludedUid = null }) {
  const start = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [directory, keys, audit, telemetry, invocations] = await Promise.all([
    auth.listUsers(DIRECTORY_LIMIT),
    db.collection('mcpApiKeys').select(...KEY_FIELDS).limit(DIRECTORY_LIMIT + 1).get(),
    db.collection('mcpProfileAuditLog')
      .where('timestamp', '>=', start).where('timestamp', '<=', now.toISOString())
      .orderBy('timestamp', 'desc').select(...AUDIT_FIELDS).limit(AUDIT_LIMIT + 1).get(),
    readTelemetry({ db, days, now }),
    readInvocations({ db, days, now }),
  ]);
  const keyRecords = keys.docs.slice(0, DIRECTORY_LIMIT).map((doc) => ({ ...doc.data(), id: doc.id }));
  const ownerKeys = new Set(keyRecords.filter((key) => excludedUid && key.principalUid === excludedUid).map((key) => key.id));
  const records = telemetry.records.filter((event) => !excludedUid || event.uid !== excludedUid);
  const snapshot = summarizeUsage({
    userRecords: directory.users.filter((user) => !excludedUid || user.uid !== excludedUid),
    keyRecords: keyRecords.filter((key) => !ownerKeys.has(key.id)),
    auditRecords: audit.docs.slice(0, AUDIT_LIMIT).map((doc) => doc.data()).filter((event) => !ownerKeys.has(event.keyId)),
    now,
    days,
    truncated: {
      usersTruncated: !!directory.pageToken,
      keysTruncated: keys.docs.length > DIRECTORY_LIMIT,
      auditTruncated: audit.docs.length > AUDIT_LIMIT,
    },
  });
  snapshot.website = summarizeTelemetry({
    records, users: snapshot.users, now, days,
    truncated: telemetry.truncated, enabled: telemetryCollectionEnabled,
  });
  snapshot.invocations = summarizeInvocations({
    ...invocations, records: invocations.records.filter((event) => !excludedUid || event.principalUid !== excludedUid),
    users: snapshot.users, now, days,
  });
  snapshot.engagement = summarizeEngagement({ records, users: snapshot.users, now, days, truncated: telemetry.truncated });
  snapshot.ownerExcluded = !!excludedUid;
  snapshot.coverage.pageViews = 'partial';
  snapshot.coverage.loginHistory = 'partial';
  snapshot.coverage.engagement = 'partial';
  snapshot.coverage.notices[snapshot.coverage.notices.length - 1] =
    'Website figures and session/active-time estimates are partial client reports. Read-window boundaries can split sessions; active time is capped and overlapping reports per user are merged. Excluding the owner cannot remove unattributed shared-key or deleted-key history.';
  return snapshot;
}

module.exports = { OWNER_EMAIL, requireUsageOwner, summarizeUsage, getUsageSnapshot };

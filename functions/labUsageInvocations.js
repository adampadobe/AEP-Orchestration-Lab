'use strict';

const LIMIT = 5000;
const DAY_MS = 86400000;
const FIELDS = ['version', 'principalUid', 'authSource', 'endpoint', 'toolset', 'tool',
  'timestamp', 'durationMs', 'handlerStarted', 'outcome', 'expiresAt'];
const OUTCOMES = ['result', 'tool_error', 'rejected', 'protocol_error', 'cancelled'];

function time(value) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value || NaN);
  return date.getTime();
}

async function readInvocations({ db, now, days }) {
  const result = await db.collection('mcpUsageInvocations')
    .where('timestamp', '>=', new Date(now.getTime() - days * DAY_MS).toISOString())
    .where('timestamp', '<=', now.toISOString()).orderBy('timestamp', 'desc')
    .select(...FIELDS).limit(LIMIT + 1).get();
  return { records: result.docs.slice(0, LIMIT).map((doc) => doc.data()), truncated: result.docs.length > LIMIT };
}

function summarizeInvocations({ records, users, now, days, truncated }) {
  const directory = new Map(users.map((user) => [user.uid, user]));
  const people = new Map();
  const tools = new Map();
  const endpoints = new Map();
  const daily = new Map();
  const hours = Array.from({ length: 7 }, () => Array(24).fill(0));
  const summary = { invocations: 0, activeUsers: 0, unattributed: 0 };
  for (const outcome of OUTCOMES) summary[outcome] = 0;
  for (const record of records) {
    const timestamp = time(record.timestamp);
    if (record.version !== 1 || !OUTCOMES.includes(record.outcome)
        || typeof record.handlerStarted !== 'boolean'
        || !Number.isFinite(timestamp) || timestamp > now.getTime()
        || timestamp < now.getTime() - days * DAY_MS || !(time(record.expiresAt) > now.getTime())
        || typeof record.endpoint !== 'string' || !/^\/mcp(?:\/[a-z0-9-]{1,40})?$/.test(record.endpoint)
        || typeof record.toolset !== 'string' || !/^[a-z0-9-]{1,40}$/.test(record.toolset)
        || !['user', 'ims', 'env', 'unknown'].includes(record.authSource)) continue;
    summary.invocations += 1;
    summary[record.outcome] += 1;
    const name = typeof record.tool === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(record.tool)
      ? record.tool : 'Unregistered tool';
    if (!tools.has(name)) tools.set(name, {
      name, invocations: 0, result: 0, tool_error: 0, rejected: 0, protocol_error: 0, cancelled: 0,
      timedInvocations: 0, totalDurationMs: 0,
    });
    const tool = tools.get(name);
    tool.invocations += 1;
    tool[record.outcome] += 1;
    if (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      tool.timedInvocations += 1;
      tool.totalDurationMs += record.durationMs;
    }
    const endpoint = record.endpoint + ' (' + record.toolset + ')';
    endpoints.set(endpoint, (endpoints.get(endpoint) || 0) + 1);
    const date = new Date(timestamp);
    hours[date.getUTCDay()][date.getUTCHours()] += 1;
    const day = date.toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) || 0) + 1);
    const user = ['user', 'ims'].includes(record.authSource) ? directory.get(record.principalUid) : null;
    if (!user) { summary.unattributed += 1; continue; }
    if (!people.has(user.uid)) people.set(user.uid, { uid: user.uid, invocations: 0, latestAt: null });
    const person = people.get(user.uid);
    person.invocations += 1;
    const iso = date.toISOString();
    if (!person.latestAt || iso > person.latestAt) person.latestAt = iso;
  }
  summary.activeUsers = people.size;
  return {
    summary, truncated, limit: LIMIT, completeness: 'partial',
    users: [...people.values()],
    tools: [...tools.values()].map(({ totalDurationMs, ...tool }) => ({
      ...tool, averageDurationMs: tool.timedInvocations ? Math.round(totalDurationMs / tool.timedInvocations) : null,
    })).sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name)),
    endpoints: [...endpoints].map(([name, invocations]) => ({ name, invocations }))
      .sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name)),
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, invocations]) => ({ date, invocations })),
    hours,
  };
}

module.exports = { readInvocations, summarizeInvocations };

'use strict';

const { ROUTES } = require('./labUsageTelemetry');
const SESSION_GAP_MS = 30 * 60000;

function summarizeEngagement({ records, users, now, days, truncated }) {
  const start = now.getTime() - days * 86400000;
  const directory = new Set(users.map((user) => user.uid));
  const actors = new Map();
  for (const record of records) {
    const receipt = Date.parse(record.timestamp);
    const expiry = record.expiresAt?.toDate ? record.expiresAt.toDate().getTime() : new Date(record.expiresAt).getTime();
    if (!directory.has(record.uid) || !ROUTES.includes(record.route)
        || !Number.isFinite(receipt) || receipt < start || receipt > now.getTime()
        || !(expiry > now.getTime()) || !['page_view', 'sign_in', 'heartbeat'].includes(record.type)) continue;
    const end = Date.parse(record.occurredAt);
    if (record.type === 'heartbeat' && (!Number.isInteger(record.activeMs) || record.activeMs < 1
        || record.activeMs > 30000 || !Number.isFinite(end) || Math.abs(end - receipt) > 300000)) continue;
    if (!actors.has(record.uid)) actors.set(record.uid, []);
    actors.get(record.uid).push(record);
  }
  const people = [];
  for (const [uid, events] of actors) {
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let sessions = 0;
    let last = null;
    const intervals = [];
    for (const event of events) {
      const receipt = Date.parse(event.timestamp);
      if (last === null || receipt - last >= SESSION_GAP_MS) sessions += 1;
      last = receipt;
      if (event.type === 'heartbeat') {
        const end = Math.min(Date.parse(event.occurredAt), now.getTime());
        const begin = Math.max(start, Date.parse(event.occurredAt) - event.activeMs);
        if (end > begin) intervals.push([begin, end]);
      }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let activeMs = 0;
    let end = -Infinity;
    for (const [begin, finish] of intervals) {
      activeMs += Math.max(0, finish - Math.max(begin, end));
      end = Math.max(end, finish);
    }
    people.push({ uid, sessions, activeMs, activeTimeRecorded: intervals.length > 0 });
  }
  return {
    completeness: 'partial', truncated, sessionGapMinutes: 30,
    summary: { sessions: people.reduce((sum, user) => sum + user.sessions, 0),
      users: people.length, activeMs: people.reduce((sum, user) => sum + user.activeMs, 0),
      activeTimeRecorded: people.some((user) => user.activeTimeRecorded) },
    users: people,
  };
}

module.exports = { summarizeEngagement };

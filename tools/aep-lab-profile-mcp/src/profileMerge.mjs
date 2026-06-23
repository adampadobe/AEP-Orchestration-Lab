/**
 * Profile Viewer full-snapshot stitch pattern for MCP updates.
 * Mirrors web/profile-viewer/app.js: after edits, re-stream ALL writable rows
 * for the target industry — not minimal deltas — so timeseries ingestion does
 * not clear sibling leaves.
 */

/**
 * @param {string} fullPath
 * @param {unknown} raw
 */
export function normalizeProfileStreamDateField(fullPath, raw) {
  if (raw == null || fullPath == null) return raw;
  const pathNorm = String(fullPath).toLowerCase();
  if (!pathNorm.includes('donationdate')) return raw;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return raw;
  const [, y, a, b] = m;
  const na = parseInt(a, 10);
  if (na > 12) return `${y}-${b}-${a}`;
  return `${y}-${a}-${b}`;
}

/**
 * @param {string} originalType
 * @param {unknown} rawValue
 */
export function coerceProfileStreamScalar(originalType, rawValue) {
  const t = String(originalType || 'string').toLowerCase();
  const s = rawValue == null ? '' : String(rawValue).trim();
  if (t === 'boolean') {
    if (s === '') return false;
    if (/^(true|1|yes|y)$/i.test(s)) return true;
    if (/^(false|0|no|n)$/i.test(s)) return false;
    return String(rawValue);
  }
  if (t === 'number') {
    if (s === '') return '';
    const n = Number(s);
    return Number.isFinite(n) ? n : String(rawValue);
  }
  if (t === 'null') {
    return s === '' ? null : String(rawValue);
  }
  return String(rawValue == null ? '' : rawValue);
}

/**
 * @param {unknown} value
 */
export function inferValueType(value) {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'string';
  return 'string';
}

/**
 * @param {Array<{ path?: string, value?: unknown, valueType?: string, industry?: string | null }>} rows
 * @param {Array<{ path: string, value: unknown, valueType?: string }>} attributeChanges
 */
export function applyAttributeChangesToRows(rows, attributeChanges) {
  const baseRows = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
  const changeMap = new Map();
  for (const ch of attributeChanges || []) {
    const path = String(ch?.path || '').trim();
    if (!path) continue;
    changeMap.set(path, ch);
  }
  if (changeMap.size === 0) return baseRows;

  const updatedRows = baseRows.map((row) => {
    const ch = changeMap.get(String(row.path || '').trim());
    if (!ch) return row;
    return {
      ...row,
      value: ch.value == null ? '' : String(ch.value),
      valueType: ch.valueType || row.valueType || inferValueType(ch.value),
    };
  });

  const existingPaths = new Set(updatedRows.map((r) => String(r.path || '').trim()).filter(Boolean));
  for (const [path, ch] of changeMap) {
    if (existingPaths.has(path)) continue;
    updatedRows.push({
      path,
      attribute: path.split('.').pop() || path,
      displayName: path,
      value: ch.value == null ? '' : String(ch.value),
      valueType: ch.valueType || inferValueType(ch.value),
      industry: ch.industry || null,
      writable: true,
    });
  }
  return updatedRows;
}

/**
 * Full writable snapshot for one industry dataflow (Profile Viewer Update profile).
 *
 * @param {object} opts
 * @param {Array<{ path?: string, value?: unknown, valueType?: string, industry?: string | null, writable?: boolean }>} opts.rows
 * @param {string} opts.industry
 */
export function buildFullSnapshotUpdates({ rows, industry }) {
  const industryKey = String(industry || 'generic').trim().toLowerCase();
  /** @type {Array<{ path: string, value: unknown, valueType: string }>} */
  const snapshot = [];

  for (const row of rows || []) {
    const rowIndustry = String(row.industry || 'generic').trim().toLowerCase();
    if (rowIndustry !== industryKey) continue;
    if (row.writable === false) continue;
    const path = String(row.path || '').trim();
    if (!path) continue;
    const valueType = row.valueType || 'string';
    const normalized = normalizeProfileStreamDateField(path, row.value);
    snapshot.push({
      path,
      value: coerceProfileStreamScalar(valueType, normalized),
      valueType,
    });
  }

  return snapshot;
}

/**
 * Dot-path attributes map → updates[] for explicit full-snapshot mode.
 *
 * @param {Record<string, unknown>} attributes
 */
export function attributesObjectToUpdates(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return [];
  }
  return Object.entries(attributes)
    .map(([path, value]) => ({
      path: String(path).trim(),
      value,
      valueType: inferValueType(value),
    }))
    .filter((u) => u.path);
}

/**
 * @param {object} opts
 * @param {object} [opts.profilePayload] - GET /api/profile/table body
 * @param {string} opts.industry
 * @param {Array<{ path: string, value: unknown, valueType?: string }>} [opts.attributeChanges]
 * @param {Record<string, unknown>} [opts.attributes]
 */
export function mergeProfileForUpdate({ profilePayload, industry, attributeChanges, attributes }) {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes) && Object.keys(attributes).length) {
    const updates = attributesObjectToUpdates(attributes);
    return {
      mode: 'explicit_full_snapshot',
      updates,
      mergedRowCount: updates.length,
      note: 'Posted attributes object directly as updates[] (caller responsible for completeness).',
    };
  }

  const rows = Array.isArray(profilePayload?.rows) ? profilePayload.rows : [];
  const mergedRows = applyAttributeChangesToRows(rows, attributeChanges || []);
  const updates = buildFullSnapshotUpdates({ rows: mergedRows, industry });

  return {
    mode: 'full_snapshot_stitch',
    updates,
    mergedRowCount: mergedRows.length,
    snapshotFieldCount: updates.length,
    note:
      'Fetched current profile, merged attribute_changes, and built full writable snapshot for industry (Profile Viewer stitch pattern).',
  };
}

/**
 * Coworker-friendly summary from GET /api/profile/table payload.
 *
 * @param {object} profilePayload
 */
export function summarizeProfileTable(profilePayload) {
  const rows = Array.isArray(profilePayload?.rows) ? profilePayload.rows : [];
  const writableByIndustry = {};
  const industriesPresent = new Set();

  for (const row of rows) {
    const key = row.industry ? String(row.industry) : null;
    if (key) industriesPresent.add(key);
    if (row.writable && key) {
      writableByIndustry[key] = (writableByIndustry[key] || 0) + 1;
    }
  }

  return {
    found: !!profilePayload?.found,
    profileEmail: profilePayload?.profileEmail || null,
    ecid: profilePayload?.ecid || null,
    entityId: profilePayload?.entityId || null,
    lastModified: profilePayload?.lastModified || null,
    attributeCount: rows.length,
    writableByIndustry,
    industriesPresent: [...industriesPresent].sort(),
  };
}

/**
 * Build narration string for lab_profile_activity.
 *
 * @param {object} opts
 * @param {number} opts.eventCount
 * @param {string[]} opts.activeChannels
 * @param {string | null} [opts.preferredMarketingChannel]
 */
export function buildActivityNarration({ eventCount, activeChannels, preferredMarketingChannel }) {
  const parts = [];
  parts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
  if (activeChannels.length) {
    parts.push(`${activeChannels.join(' + ')} active`);
  } else {
    parts.push('no active marketing channels');
  }
  if (preferredMarketingChannel) {
    parts.push(`preferred ${preferredMarketingChannel}`);
  }
  return parts.join(', ');
}

/**
 * Derive active marketing channels from consent payload.
 *
 * @param {object} consentPayload
 */
export function extractActiveChannels(consentPayload) {
  const active = [];
  const channels = consentPayload?.channels && typeof consentPayload.channels === 'object' ? consentPayload.channels : {};
  const optInOut =
    consentPayload?.channelOptInOut && typeof consentPayload.channelOptInOut === 'object'
      ? consentPayload.channelOptInOut
      : {};

  const channelKeys = new Set([...Object.keys(channels), ...Object.keys(optInOut)]);
  for (const ch of channelKeys) {
    const raw = channels[ch] ?? optInOut[ch];
    const norm = raw == null ? '' : String(raw).toLowerCase().trim();
    if (norm === 'in' || norm === 'y' || norm === 'yes' || norm === 'vi') {
      active.push(ch);
    }
  }
  return active.sort();
}

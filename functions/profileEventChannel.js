/**
 * Derive a marketing / experience channel string for Profile Viewer Events tab.
 * Used by GET /api/profile/events payload builders (Query Service rows + UPS experience events).
 */
const { get } = require('./profileTableHelpers');

const ENTITY_CHANNEL_PATHS = [
  '_demoemea.interactionDetails.core.channel',
  'interactionDetails.core.channel',
  'device.channel',
  'xdm.device.channel',
];

function normPath(path) {
  return String(path || '')
    .toLowerCase()
    .replace(/_/g, '.');
}

/**
 * Flattened row paths that plausibly carry a channel discriminator (web, mobile, email, …).
 */
function rowLooksLikeChannelLeaf(path) {
  const pl = normPath(path);
  if (!pl.includes('channel')) return false;
  if (pl.includes('channelcontext') && (pl.endsWith('.namespace') || pl.endsWith('_namespace'))) return true;
  if (pl === 'channel') return true;
  if (pl.endsWith('.channel')) return true;
  return false;
}

function rowChannelPriority(path) {
  const pl = normPath(path);
  if (pl.includes('_demoemea') && pl.includes('interactiondetails') && pl.includes('channel')) return 0;
  if (pl.includes('interactiondetails') && pl.includes('core') && pl.includes('channel')) return 1;
  if (pl.includes('xdm') && pl.includes('device') && pl.includes('channel')) return 2;
  if (pl.endsWith('device.channel')) return 2;
  if (pl === 'channel') return 4;
  if (pl.endsWith('.channel')) return 5;
  if (pl.includes('channelcontext') && pl.endsWith('.namespace')) return 6;
  return 50;
}

function pickBestChannelFromRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const hits = [];
  for (const r of rows) {
    if (!r || r.value == null) continue;
    const val = String(r.value).trim();
    if (!val) continue;
    const p = r.path || '';
    if (!rowLooksLikeChannelLeaf(p)) continue;
    hits.push({ p, val, pri: rowChannelPriority(p) });
  }
  if (!hits.length) return '';
  hits.sort((a, b) => a.pri - b.pri || a.p.localeCompare(b.p));
  return hits[0].val;
}

function eventTypeImpliesWeb(eventType) {
  const low = String(eventType || '').toLowerCase();
  if (!low) return false;
  if (low.includes('web.webpagedetails') && low.includes('pageviews')) return true;
  if (low.startsWith('web.')) return true;
  return false;
}

/**
 * @param {object|null|undefined} entity Raw experience-event object (or Query Service row).
 * @param {Array<{path?: string, value?: string}>} rows Flattened attribute rows (same shape as UI `ev.rows`).
 * @returns {string} Normalized channel string, or '' when unknown.
 */
function deriveEventChannel(entity, rows) {
  const obj = entity && typeof entity === 'object' && !Array.isArray(entity) ? entity : null;
  if (obj) {
    for (const path of ENTITY_CHANNEL_PATHS) {
      const raw = get(obj, path);
      if (raw != null && String(raw).trim()) return String(raw).trim();
    }
  }
  const fromRows = pickBestChannelFromRows(rows);
  if (fromRows) return fromRows;
  const et = obj ? obj.eventType ?? obj.eventTypeId ?? '' : '';
  if (eventTypeImpliesWeb(et)) return 'web';
  return '';
}

module.exports = { deriveEventChannel };

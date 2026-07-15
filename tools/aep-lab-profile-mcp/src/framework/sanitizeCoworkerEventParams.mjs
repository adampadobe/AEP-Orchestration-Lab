/**
 * Strip params that trigger rich XDM on the lab server. Coworker / MCP event tools must
 * match Event tool UI minimal sends: event_type, channel, timestamp, email, ecid only.
 */

/** @typedef {Record<string, unknown>} EventParams */

/** Params allowed on minimal Coworker event tool calls. */
export const COWORKER_MINIMAL_EVENT_PARAM_KEYS = Object.freeze([
  'sandbox',
  'email',
  'ecid',
  'target_id',
  'event_type',
  'channel',
  'timestamp',
  'orchestration_event_id',
  'event_id',
  'target_id',
  'auto_fetch_ecid',
  'edge_minimal',
  'xdm_style',
]);

/** Params stripped from Coworker calls — they upgrade server XDM beyond Event tool minimal. */
export const COWORKER_STRIPPED_EVENT_PARAM_KEYS = Object.freeze([
  'view_name',
  'view_url',
  'public',
  'message',
  'industry',
  'xdm_tenant_key',
  'identity_map_ecid_key',
  'primary_identity',
  'email_primary_identity',
]);

/**
 * @param {EventParams} params
 * @returns {{ params: EventParams, stripped: string[], warnings: string[] }}
 */
export function sanitizeCoworkerEventParams(params = {}) {
  /** @type {EventParams} */
  const out = { ...params };
  /** @type {string[]} */
  const stripped = [];
  /** @type {string[]} */
  const warnings = [];

  for (const key of COWORKER_STRIPPED_EVENT_PARAM_KEYS) {
    if (out[key] == null) continue;
    const val = out[key];
    const hasValue =
      typeof val === 'string'
        ? val.trim().length > 0
        : typeof val === 'object' && val !== null && !Array.isArray(val)
          ? Object.keys(val).length > 0
          : val != null && val !== false;
    if (hasValue) {
      stripped.push(key);
      warnings.push(
        `Stripped "${key}" — Coworker minimal events allow ONLY sandbox, email, ecid, event_type, channel, timestamp. ` +
          'Do not pass view_name, view_url, public, message, or tenant keys.',
      );
    }
    delete out[key];
  }

  if (out.edge_minimal === false) {
    stripped.push('edge_minimal');
    delete out.edge_minimal;
    warnings.push('Stripped edge_minimal:false — Coworker intent demos always use minimal server-built XDM.');
  }
  if (out.xdm_style === 'full') {
    stripped.push('xdm_style');
    delete out.xdm_style;
    warnings.push('Stripped xdm_style:full — Coworker intent demos always use minimal server-built XDM.');
  }

  return { params: out, stripped, warnings };
}

/**
 * Strip view_name / view_url from batch event steps.
 *
 * @param {Array<Record<string, unknown>>} events
 * @returns {{ events: Array<Record<string, unknown>>, stripped: string[], warnings: string[] }}
 */
export function sanitizeCoworkerEventSteps(events = []) {
  /** @type {string[]} */
  const stripped = [];
  /** @type {string[]} */
  const warnings = [];
  const cleaned = events.map((step, index) => {
    if (!step || typeof step !== 'object') return step;
    /** @type {Record<string, unknown>} */
    const out = { ...step };
    for (const key of ['view_name', 'view_url', 'public', 'message']) {
      if (out[key] == null) continue;
      const val = out[key];
      const hasValue =
        typeof val === 'string'
          ? val.trim().length > 0
          : typeof val === 'object' && val !== null && !Array.isArray(val)
            ? Object.keys(val).length > 0
            : true;
      if (hasValue) {
        stripped.push(`events[${index}].${key}`);
        warnings.push(`Stripped events[${index}].${key} — batch steps allow ONLY event_type, channel, timestamp.`);
      }
      delete out[key];
    }
    return out;
  });
  return { events: cleaned, stripped, warnings };
}

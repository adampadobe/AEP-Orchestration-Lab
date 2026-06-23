import { appendRecentProfile } from '../labApiClient.mjs';

/**
 * Record a generated profile in shared Firestore recent list (Portal dropdown sync).
 * @param {object} params
 */
export async function recordRecentProfileGenerated(params) {
  const email = String(params.email || '').trim();
  if (!email) return { ok: false, skipped: true, reason: 'no email' };

  const body = {
    sandbox: params.sandbox,
    email,
    ecid: params.ecid,
    industry: params.industry || 'generic',
    source: 'mcp',
    attributes: params.attributes,
    personName: params.personName,
    mobilePhone: params.mobilePhone,
    generatedAt: params.generatedAt || new Date().toISOString(),
    summaryLabel: params.summaryLabel,
  };

  try {
    const apiResult = await appendRecentProfile(body);
    if (!apiResult.ok) {
      return { ok: false, error: apiResult.error || 'recent-profiles POST failed' };
    }
    return {
      ok: true,
      item: apiResult.data?.item,
      itemsCount: Array.isArray(apiResult.data?.items) ? apiResult.data.items.length : undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Build personName / mobile hints from flat attributes for API label builder.
 * @param {Record<string, unknown> | undefined} attrs
 */
export function personHintsFromAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') {
    return { personName: undefined, mobilePhone: undefined };
  }
  const first = String(attrs['person.name.firstName'] || '').trim();
  const last = String(attrs['person.name.lastName'] || '').trim();
  const personName = `${first} ${last}`.trim() || undefined;
  const mobilePhone =
    String(attrs['mobilePhone.number'] || attrs['mobilePhone.phoneNumber'] || '').trim() || undefined;
  return { personName, mobilePhone };
}

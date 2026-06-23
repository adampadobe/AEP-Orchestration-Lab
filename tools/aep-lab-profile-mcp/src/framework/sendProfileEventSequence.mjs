/**
 * Send a sequence of Experience Events with Portal Event tool identity rules.
 */

import { listEventTargets, lookupProfile, sendProfileEvent } from '../labApiClient.mjs';
import {
  LAB_EVENT_TOOL_TARGET_ID,
  buildEventPreflightSummary,
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from './eventIdentity.mjs';

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.email
 * @param {string} [params.ecid]
 * @param {Array<import('./demoEventPacks.mjs').DemoEventStep>} params.events
 * @param {string} [params.target_id]
 * @param {number} [params.delay_ms]
 * @param {boolean} [params.preflight]
 * @param {boolean} [params.auto_fetch_ecid]
 */
export async function sendProfileEventSequence({
  sandbox,
  email,
  ecid,
  events,
  target_id,
  delay_ms = 800,
  preflight = true,
  auto_fetch_ecid = true,
}) {
  const emailTrim = String(email || '').trim();
  if (!emailTrim) {
    return { ok: false, error: 'email is required for event sequence send.' };
  }
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, error: 'events array is required and must not be empty.' };
  }

  let profileEcid = null;
  let autoFetched = false;
  const ecidTrim = ecid != null ? String(ecid).trim() : '';

  if (auto_fetch_ecid !== false && !ecidTrim) {
    const profileResult = await lookupProfile({
      sandbox,
      namespace: 'email',
      identifier: emailTrim,
    });
    if (profileResult.ok) {
      profileEcid = extractEcidFromProfileTable(profileResult.data);
      autoFetched = !!profileEcid;
    }
  }

  const resolved = resolveEventIdentities({
    email: emailTrim,
    ecid: ecidTrim,
    profileEcid,
    autoFetchedEcid: autoFetched,
  });

  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  /** @type {Record<string, unknown> | null} */
  let preflightSummary = null;
  if (preflight) {
    const targetsResult = await listEventTargets({ sandbox });
    const targets = targetsResult.ok && Array.isArray(targetsResult.data?.targets)
      ? targetsResult.data.targets
      : [];
    preflightSummary = buildEventPreflightSummary({
      sandbox,
      email: resolved.email,
      ecid: resolved.ecid,
      target_id: target_id || LAB_EVENT_TOOL_TARGET_ID,
      targets,
      warnings: resolved.warnings,
    });
  }

  /** @type {Array<Record<string, unknown>>} */
  const stepResults = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < events.length; i += 1) {
    if (i > 0 && delay_ms > 0) {
      await new Promise((r) => setTimeout(r, delay_ms));
    }

    const step = events[i];
    const apiResult = await sendProfileEvent({
      sandbox,
      email: resolved.email,
      ecid: resolved.ecid || undefined,
      target_id,
      event_type: step.event_type,
      view_name: step.view_name,
      view_url: step.view_url,
      channel: step.channel || 'web',
      timestamp: step.timestamp,
      public: step.public,
      message: step.message,
    });

    stepResults.push({
      index: i,
      event_type: step.event_type,
      view_name: step.view_name || null,
      ok: apiResult.ok,
      error: apiResult.ok ? undefined : apiResult.error,
      transport: apiResult.ok && apiResult.data?.transport ? apiResult.data.transport : null,
      eventId: apiResult.ok && apiResult.data?.eventId ? apiResult.data.eventId : null,
    });

    if (apiResult.ok) sent += 1;
    else failed += 1;
  }

  return {
    ok: failed === 0,
    email: resolved.email,
    ecid: resolved.ecid || null,
    sent,
    failed,
    total: events.length,
    warnings: resolved.warnings.length ? resolved.warnings : undefined,
    preflight: preflightSummary,
    results: stepResults,
    verify_hint: 'Call lab_profile_activity after 30–60s UPS lag to confirm events landed.',
  };
}

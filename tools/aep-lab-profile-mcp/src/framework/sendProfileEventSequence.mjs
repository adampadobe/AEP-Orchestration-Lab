/**
 * Send a sequence of Experience Events with Portal Event tool identity rules.
 * Each step is one POST /api/events/generator (sequential, not one Edge bulk payload).
 */

import { listEventTargets, lookupProfile, sendProfileEvent } from '../labApiClient.mjs';
import { minutesAgoIso } from './demoEventPacks.mjs';
import {
  LAB_EVENT_TOOL_TARGET_ID,
  buildEventPreflightSummary,
  extractEcidFromProfileTable,
  resolveEventIdentities,
  validateEventTarget,
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
 * @param {{ listEventTargets?: typeof listEventTargets, sendProfileEvent?: typeof sendProfileEvent }} [params.deps]
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
  deps,
}) {
  const listTargetsFn = deps?.listEventTargets ?? listEventTargets;
  const sendEventFn = deps?.sendProfileEvent ?? sendProfileEvent;

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
  const targetsResult = await listTargetsFn({ sandbox });
  const targets = targetsResult.ok && Array.isArray(targetsResult.data?.targets)
    ? targetsResult.data.targets
    : [];
  const targetCheck = validateEventTarget({ target_id: target_id || LAB_EVENT_TOOL_TARGET_ID, targets });
  if (!targetCheck.ok) {
    return { ok: false, error: targetCheck.error, ...targetCheck };
  }

  if (preflight) {
    preflightSummary = buildEventPreflightSummary({
      sandbox,
      email: resolved.email,
      ecid: resolved.ecid,
      target_id: targetCheck.requested_id,
      targets,
      warnings: resolved.warnings,
      eventFields: events[0],
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
    const timestamp =
      step.timestamp && String(step.timestamp).trim()
        ? String(step.timestamp).trim()
        : minutesAgoIso((events.length - i) * 2);

    const apiResult = await sendEventFn({
      sandbox,
      email: resolved.email,
      ecid: resolved.ecid || undefined,
      target_id: targetCheck.requested_id,
      event_type: step.event_type,
      channel: step.channel || 'web',
      timestamp,
      industry: step.industry,
      public: step.public,
      edge_minimal: step.edge_minimal,
      xdm_style: step.xdm_style,
    });

    const lab = apiResult.ok && apiResult.data && typeof apiResult.data === 'object' ? apiResult.data : {};

    stepResults.push({
      index: i,
      event_type: step.event_type,
      channel: step.channel || 'web',
      timestamp,
      industry: step.industry || null,
      rich: step.xdm_style === 'full',
      ok: apiResult.ok,
      error: apiResult.ok ? undefined : apiResult.error,
      transport: lab.transport || null,
      requestId: lab.requestId || null,
      eventId: lab.eventId || null,
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
    send_mode: 'sequential_generator_posts',
    warnings: resolved.warnings.length ? resolved.warnings : undefined,
    preflight: preflightSummary,
    results: stepResults,
    verify_hint: 'Call lab_profile_activity after 30–60s UPS lag to confirm events landed.',
    stitch_note:
      'Each step is a separate POST /api/events/generator (same as clicking Send in Event tool once per event). ' +
      'ok:true per step means Edge accepted the event — not that UPS already shows it. ' +
      'For lab-event-tool-edge, eventId is null in results; use requestId instead (DCS streaming returns eventId).',
  };
}

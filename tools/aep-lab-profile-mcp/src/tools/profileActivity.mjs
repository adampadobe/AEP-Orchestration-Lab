import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getProfileAudiences, getProfileConsent, getProfileEvents } from '../labApiClient.mjs';
import { buildActivityNarration, extractActiveChannels } from '../profileMerge.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const NAMESPACE_HINT = 'email | ecid | crmId | loyaltyId | phone';

/**
 * @param {unknown} ts
 */
function formatEventTimestamp(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileActivityTool(mcpServer) {
  mcpServer.registerTool(
    'lab_profile_activity',
    {
      title: 'Profile activity and channels',
      description:
        'Aggregate Profile Viewer visualization data: event count/recent events (GET /api/profile/events), marketing channels/consent (GET /api/profile/consent), optional audiences. Returns a Coworker narration summary.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        namespace: z
          .string()
          .optional()
          .describe(`Identity namespace (default email). ${NAMESPACE_HINT}`),
        identifier: z.string().describe('Identity value (email address, ECID, etc.)'),
        recent_event_limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe('Recent events to include in summary (default 5)'),
        include_audiences: z
          .boolean()
          .optional()
          .describe('Include GET /api/profile/audiences (default false — slower)'),
      },
    },
    async ({ sandbox, namespace, identifier, recent_event_limit, include_audiences }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const id = String(identifier || '').trim();
      if (!id) {
        return toolError('identifier is required.');
      }

      const ns = String(namespace || 'email').trim().toLowerCase();
      const recentLimit = recent_event_limit ?? 5;
      const withAudiences = include_audiences === true;

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_profile_activity',
        sandbox: allowed.sandbox,
        namespace: ns,
      });

      const query = {
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
      };

      const [eventsResult, consentResult] = await Promise.all([
        getProfileEvents(query),
        getProfileConsent(query),
      ]);

      let audiences = null;
      if (withAudiences) {
        const audiencesResult = await getProfileAudiences(query);
        audiences = audiencesResult.ok
          ? audiencesResult.data
          : { error: audiencesResult.error, status: audiencesResult.status };
      }

      const eventsPayload = eventsResult.ok ? eventsResult.data : { events: [], error: eventsResult.error };
      const consentPayload = consentResult.ok ? consentResult.data : { found: false, error: consentResult.error };

      const events = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];
      const activeChannels = extractActiveChannels(consentPayload);
      const narration = buildActivityNarration({
        eventCount: events.length,
        activeChannels,
        preferredMarketingChannel: consentPayload?.preferredMarketingChannel || null,
      });

      const recentEvents = events.slice(0, recentLimit).map((ev) => ({
        eventType: ev.eventType || null,
        eventName: ev.eventName || null,
        channel: ev.channel || null,
        timestamp: formatEventTimestamp(ev.timestamp),
      }));

      const channelSummary = {
        active: activeChannels,
        preferredMarketingChannel: consentPayload?.preferredMarketingChannel || null,
        marketingConsent: consentPayload?.marketingConsent ?? null,
        channels: consentPayload?.channels || null,
        channelOptInOut: consentPayload?.channelOptInOut || null,
      };

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
        narration,
        events: {
          count: events.length,
          source: eventsPayload?.source || null,
          recent: recentEvents,
          ...(eventsResult.ok ? {} : { error: eventsResult.error, status: eventsResult.status }),
        },
        channels: channelSummary,
        consentFound: consentPayload?.found !== false,
        ...(withAudiences ? { audiences } : {}),
      });
    },
  );
}

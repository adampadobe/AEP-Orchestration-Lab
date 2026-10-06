import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getFirestoreDb } from './firestoreAdmin.mjs';
import { requestContext } from './requestContext.mjs';

const invocationContext = new AsyncLocalStorage();
const RETENTION_MS = 90 * 86400000;
export const USAGE_COLLECTION = 'mcpUsageInvocations';

export function usageCollectionEnabled() {
  return process.env.AEP_LAB_MCP_USAGE_ENABLED === 'true';
}

async function persistInvocation(id, record) {
  const db = await getFirestoreDb();
  if (!db) throw new Error('Usage storage unavailable');
  await db.collection(USAGE_COLLECTION).doc(id).create(record);
}

/**
 * Wrap the public SDK registration boundary before tools are registered. The
 * dispatch wrapper also sees SDK input/output validation and disabled tools.
 */
export function installUsageTelemetry(server, endpoint, options = {}) {
  const enabled = options.enabled || usageCollectionEnabled;
  const write = options.write || persistInvocation;
  const logger = options.logger || console;
  const registeredNames = new Set();
  const registerTool = server.registerTool.bind(server);
  server.registerTool = (name, definition, handler) => {
    const registered = registerTool(name, definition, async (...args) => {
      const invocation = invocationContext.getStore();
      if (invocation) invocation.handlerStarted = true;
      return handler(...args);
    });
    registeredNames.add(name);
    return registered;
  };

  const setRequestHandler = server.server.setRequestHandler.bind(server.server);
  server.server.setRequestHandler = (schema, handler) => {
    if (schema !== CallToolRequestSchema) return setRequestHandler(schema, handler);
    return setRequestHandler(schema, async (request, extra) => {
      if (!enabled()) return handler(request, extra);
      const context = requestContext.getStore() || {};
      const source = ['user', 'ims', 'env'].includes(context.authSource) ? context.authSource : 'unknown';
      const uid = context.usagePrincipalUid;
      const principalUid = ['user', 'ims'].includes(source)
        && typeof uid === 'string' && uid.length > 0 && uid.length <= 128 ? uid : null;
      const sandbox = request.params.arguments?.sandbox;
      const requestedSandbox = typeof sandbox === 'string'
        && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(sandbox)
        && context.principalAccess?.allowedSet?.has(sandbox) ? sandbox : null;
      const startedAt = new Date().toISOString();
      const monotonicStart = performance.now();
      const invocation = { handlerStarted: false };
      let outcome = 'protocol_error';
      let protocolResponse = 'error';
      try {
        const result = await invocationContext.run(invocation, () => handler(request, extra));
        protocolResponse = 'result';
        outcome = !invocation.handlerStarted ? 'rejected' : result?.isError === true ? 'tool_error' : 'result';
        return result;
      } finally {
        const endedAt = new Date();
        const record = {
          version: 1,
          principalUid,
          authSource: source,
          endpoint: endpoint.path,
          toolset: endpoint.toolset,
          tool: registeredNames.has(request.params.name) ? request.params.name : null,
          requestedSandbox,
          startedAt,
          timestamp: endedAt.toISOString(),
          durationMs: Math.max(0, Math.round(performance.now() - monotonicStart)),
          handlerStarted: invocation.handlerStarted,
          outcome: extra.signal?.aborted ? 'cancelled' : outcome,
          protocolResponse,
          expiresAt: new Date(endedAt.getTime() + RETENTION_MS),
        };
        let timer;
        const timeout = new Error('Usage persistence deadline');
        try {
          await Promise.race([
            Promise.resolve().then(() => write(randomUUID(), record)),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(timeout), options.writeTimeoutMs ?? 2000);
            }),
          ]);
        } catch (error) {
          // Optional statistics must not change a completed tool's response.
          logger.warn(JSON.stringify({
            type: 'aep-lab-mcp-usage-write-failed',
            code: error === timeout ? 'USAGE_PERSISTENCE_TIMEOUT' : 'USAGE_PERSISTENCE_FAILED',
          }));
        } finally {
          clearTimeout(timer);
        }
      }
    });
  };
  return server;
}

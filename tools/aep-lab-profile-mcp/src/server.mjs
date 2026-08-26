/**
 * Streamable HTTP MCP server for AEP Orchestration Lab profile tools.
 *
 * Env: see tools/aep-lab-profile-mcp/.env.mcp.example
 * Local: copy to .env.mcp (gitignored).
 *
 * Endpoints: POST /mcp and focused /mcp/{entry,profile,audiences,ajo-cleanup,decisioning,demo-prep,pdf}
 * Health:   GET /health
 */

import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { loadAuthConfig, validateMcpApiKey } from './auth.mjs';
import { getLabApiOrigin } from './labApiClient.mjs';
import { requestContext } from './requestContext.mjs';
import { resolvePrincipalAccess } from './sandboxAllowlist.mjs';
import { registerSession, getSession, deleteSession } from './sessionRegistry.mjs';
import { registerFrameworkResources } from './resources/frameworkResources.mjs';
import { registerMcpGuideResources } from './resources/mcpGuideResources.mjs';
import { installToolAnnotations } from './toolAnnotations.mjs';
import {
  registerFocusedAudienceTools,
  registerFocusedAjoCleanupTools,
  registerFocusedDecisioningTools,
  registerFocusedDemoPrepTools,
  registerFocusedProfileTools,
  registerFocusedMcpGuideTools,
  registerFocusedPdfTools,
  registerFocusedCommandCentreTools,
  registerProfileTools,
} from './tools/index.mjs';

const MCP_VERSION = '3.40.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

const ENDPOINTS = [
  {
    path: '/mcp/entry',
    toolset: 'entry',
    register: registerFocusedMcpGuideTools,
    instructions:
      'Read-only AEP Lab MCP capability directory. Recommend the smallest configured context and cross-context workflow; never claim to connect, switch, proxy, or execute another MCP server.',
  },
  {
    path: '/mcp',
    toolset: 'full',
    register: registerProfileTools,
    instructions: 'Complete AEP Orchestration Lab catalog. Prefer a focused endpoint when the client cannot invoke deferred tools.',
  },
  {
    path: '/mcp/profile',
    toolset: 'profile',
    register: registerFocusedProfileTools,
    instructions:
      'Focused profile lifecycle: readiness, create/update/read, governed AEP industry events, and Snowflake dual-load readiness, enrichment, and readback.',
  },
  {
    path: '/mcp/audiences',
    toolset: 'audiences',
    register: registerFocusedAudienceTools,
    instructions: 'Governed audience cleanup: list, audit, exact confirmation, then delete one audience.',
  },
  {
    path: '/mcp/ajo-cleanup',
    toolset: 'ajo-cleanup',
    register: registerFocusedAjoCleanupTools,
    instructions:
      'Governed AJO cleanup: list and audit journeys or campaigns, obtain exact colleague confirmation, then delete one lifecycle-eligible asset.',
  },
  {
    path: '/mcp/decisioning',
    toolset: 'decisioning',
    register: registerFocusedDecisioningTools,
    instructions: 'Focused decisioning evaluation, response explanation, treatment resolution, and catalog assessment.',
  },
  {
    path: '/mcp/demo-prep',
    toolset: 'demo-prep',
    register: registerFocusedDemoPrepTools,
    instructions:
      'Focused customer demo preparation: resolve or run one brand scrape, preview stable image-hosting slots and governed RTDB changes, obtain explicit confirmation, activate with automatic customer backup, and restore named customers.',
  },
  {
    path: '/mcp/pdf',
    toolset: 'pdf',
    register: registerFocusedPdfTools,
    bodyLimit: '24mb',
    instructions:
      'Focused PDF preparation: inspect capabilities, upload HTML or documents, preview, generate and find stored PDFs, and manage user-owned server templates. Use fresh idempotency keys for new PDFs and exact confirmation before publishing or archiving templates.',
  },
  {
    path: '/mcp/command-centre',
    toolset: 'command-centre',
    register: registerFocusedCommandCentreTools,
    instructions:
      'Admin layer for the caller\'s own Solutions Consultant Command Centre (opportunities/customer engagements, ' +
      'tasks, and meetings tracked on their AEP Orchestration Lab home page). List, add, update, and delete — all ' +
      'scoped to whichever user generated the connected MCP key. Requires a user-generated key, not a shared ops key.',
  },
];

export function createMcpServer(endpoint = ENDPOINTS[0]) {
  const server = new McpServer({
    name: 'aep-orchestration-lab-mcp',
    version: MCP_VERSION,
  }, {
    instructions: endpoint.instructions,
  });
  installToolAnnotations(server);
  if (endpoint.toolset === 'full') registerFrameworkResources(server);
  if (endpoint.toolset === 'full' || endpoint.toolset === 'entry') registerMcpGuideResources(server);
  endpoint.register(server);
  return server;
}

function jsonRpcError(res, status, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

async function main() {
  let cfg;
  try {
    cfg = loadAuthConfig();
  } catch (err) {
    console.error('[aep-lab-profile-mcp]', err.message || err);
    process.exit(1);
  }

  const app = express();
  const smallJson = express.json({ limit: '1mb' });
  const largeJson = express.json({ limit: '24mb' });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'aep-lab-profile-mcp',
      version: MCP_VERSION,
      labOrigin: getLabApiOrigin(),
      allowedSandboxes: cfg.allowedSandboxes,
      mcpEndpoints: ENDPOINTS.map(({ path, toolset }) => ({ path, toolset })),
      note: 'Per-principal allowlist may override via Firestore mcpSandboxAllowlist/{keyId}',
    });
  });

  function registerEndpoint(endpoint) {
    const authenticate = async (req, res, next) => {
      const auth = await validateMcpApiKey(req);
      if (!auth.ok) {
        jsonRpcError(res, auth.status, auth.message);
        return;
      }
      const principalAccess = await resolvePrincipalAccess(auth.keyId, { source: auth.source });
      req.mcpAuth = { auth, principalAccess };
      next();
    };
    const parser = endpoint.bodyLimit || endpoint.toolset === 'full' ? largeJson : smallJson;
    app.post(endpoint.path, authenticate, parser, async (req, res) => {
      const startedAt = Date.now();
      const rpcMethod = String(req.body?.method || 'unknown');
      const toolName = rpcMethod === 'tools/call' ? String(req.body?.params?.name || '') : undefined;
      res.once('finish', () => {
        console.log(JSON.stringify({
          type: 'aep-lab-mcp-request',
          endpoint: endpoint.path,
          toolset: endpoint.toolset,
          method: rpcMethod,
          ...(toolName ? { tool: toolName } : {}),
          httpStatus: res.statusCode,
          durationMs: Date.now() - startedAt,
        }));
      });

      const { auth, principalAccess } = req.mcpAuth;
      const mcpKey = String(req.headers['x-aep-lab-mcp-key'] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
      const sessionId = req.headers['mcp-session-id'];

      await requestContext.run({ keyId: auth.keyId, principalAccess, mcpApiKey: mcpKey, sessionId }, async () => {
        try {
          let transport;

          const active = sessionId ? getSession(sessionId) : undefined;
          if (active) {
            if (active.endpoint !== endpoint.path) {
              jsonRpcError(res, 400, `MCP session belongs to ${active.endpoint}, not ${endpoint.path}.`);
              return;
            }
            transport = active.transport;
          } else if (!sessionId && isInitializeRequest(req.body)) {
            let server;
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              enableJsonResponse: true,
              onsessioninitialized: (id) => {
                registerSession(id, { transport, server, endpoint: endpoint.path, loadedCategories: new Set() });
              },
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) deleteSession(sid);
            };

            server = createMcpServer(endpoint);
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
          } else {
            jsonRpcError(res, 400, 'Bad Request: no valid MCP session. Send initialize without mcp-session-id.');
            return;
          }

          await transport.handleRequest(req, res, req.body);
        } catch (err) {
          console.error('[aep-lab-profile-mcp] MCP handler error:', err);
          if (!res.headersSent) jsonRpcError(res, 500, 'Internal server error');
        }
      });
    });

    app.get(endpoint.path, (_req, res) => {
      res.status(405).set('Allow', 'POST').json({
        error: `Use POST ${endpoint.path} for Streamable HTTP (JSON mode).`,
      });
    });

    app.delete(endpoint.path, async (req, res) => {
      const auth = await validateMcpApiKey(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.message });
        return;
      }
      const sessionId = req.headers['mcp-session-id'];
      const active = sessionId ? getSession(sessionId) : undefined;
      if (active?.endpoint === endpoint.path) {
        await active.transport.close();
        deleteSession(sessionId);
        res.status(200).json({ ok: true });
        return;
      }
      res.status(404).json({ error: 'Session not found' });
    });
  }

  for (const endpoint of ENDPOINTS) registerEndpoint(endpoint);

  const host = String(process.env.HOST || '0.0.0.0').trim();
  const port = Number(process.env.PORT || 8080);

  app.listen(port, host, () => {
    console.log(
      JSON.stringify({
        type: 'aep-lab-profile-mcp-start',
        version: MCP_VERSION,
        host,
        port,
        labOrigin: getLabApiOrigin(),
        allowedSandboxes: cfg.allowedSandboxes,
        mcpEndpoints: ENDPOINTS.map(({ path, toolset }) => ({
          toolset,
          url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${path}`,
        })),
      }),
    );
  });
}

main().catch((err) => {
  console.error('[aep-lab-profile-mcp]', err);
  process.exit(1);
});

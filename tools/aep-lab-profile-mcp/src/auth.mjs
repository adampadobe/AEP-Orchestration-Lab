import { keyIdFromApiKey } from './auditLog.mjs';
import { getPrincipalAccess } from './requestContext.mjs';
import { assertSandboxAllowedForAccess } from './sandboxAllowlist.mjs';

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';

let configCache = null;

/**
 * Load auth + sandbox policy from environment (cached after first call).
 */
export function loadAuthConfig() {
  if (configCache) return configCache;

  const apiKey = String(process.env.AEP_LAB_MCP_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'AEP_LAB_MCP_API_KEY is required. Copy tools/aep-lab-profile-mcp/.env.mcp.example to .env.mcp and set a secret.',
    );
  }

  const allowedRaw = String(process.env.AEP_LAB_MCP_ALLOWED_SANDBOXES || 'apalmer,kirkham').trim();
  const allowedSandboxes = allowedRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowedSandboxes.length === 0) {
    throw new Error('AEP_LAB_MCP_ALLOWED_SANDBOXES must list at least one sandbox name.');
  }

  configCache = {
    apiKey,
    keyId: keyIdFromApiKey(apiKey),
    allowedSandboxes,
    allowedSet: new Set(allowedSandboxes),
  };
  return configCache;
}

/**
 * Validate incoming MCP HTTP request API key.
 * @param {import('express').Request} req
 * @returns {{ ok: true, keyId: string } | { ok: false, status: number, message: string }}
 */
export function validateMcpApiKey(req) {
  const cfg = loadAuthConfig();
  const provided = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();

  if (!provided) {
    return {
      ok: false,
      status: 401,
      message: `Missing ${MCP_KEY_HEADER} header.`,
    };
  }

  if (provided !== cfg.apiKey) {
    return {
      ok: false,
      status: 403,
      message: 'Invalid MCP API key.',
    };
  }

  return { ok: true, keyId: cfg.keyId };
}

/**
 * Ensure sandbox is on the MCP allowlist for the current principal (case-insensitive).
 * Uses Firestore mcpSandboxAllowlist/{keyId} when present, else env fallback.
 *
 * @param {string | undefined | null} sandbox
 * @returns {{ ok: true, sandbox: string } | { ok: false, message: string, allowedSandboxes: string[] }}
 */
export function assertSandboxAllowed(sandbox) {
  const access = getPrincipalAccess();
  if (access) {
    return assertSandboxAllowedForAccess(sandbox, access);
  }

  const cfg = loadAuthConfig();
  return assertSandboxAllowedForAccess(sandbox, {
    allowedSandboxes: cfg.allowedSandboxes,
    allowedSet: cfg.allowedSet,
  });
}

/**
 * Phase 3.5 OAuth scaffold — not wired for Coworker OIDC yet.
 * When AEP_LAB_MCP_OAUTH_ISSUER and AEP_LAB_MCP_OAUTH_AUDIENCE are set, validate Bearer JWT (stub).
 *
 * @param {import('express').Request} req
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateOAuthBearer(req) {
  const issuer = String(process.env.AEP_LAB_MCP_OAUTH_ISSUER || '').trim();
  const audience = String(process.env.AEP_LAB_MCP_OAUTH_AUDIENCE || '').trim();

  if (!issuer || !audience) {
    return {
      ok: false,
      message:
        'OAuth bearer auth is not configured. Set AEP_LAB_MCP_OAUTH_ISSUER and AEP_LAB_MCP_OAUTH_AUDIENCE (Phase 3.5). Use X-AEP-Lab-Mcp-Key today.',
    };
  }

  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, message: 'Missing Authorization: Bearer token.' };
  }

  return {
    ok: false,
    message:
      'OAuth issuer/audience env vars are set but JWT validation is not implemented yet (Phase 3.5). Use X-AEP-Lab-Mcp-Key.',
  };
}

import { keyIdFromApiKey } from './auditLog.mjs';

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
 * Ensure sandbox is on the MCP allowlist (case-insensitive).
 * @param {string | undefined | null} sandbox
 * @returns {{ ok: true, sandbox: string } | { ok: false, message: string, allowedSandboxes: string[] }}
 */
export function assertSandboxAllowed(sandbox) {
  const cfg = loadAuthConfig();
  const normalized = String(sandbox || '').trim().toLowerCase();
  if (!normalized) {
    return {
      ok: false,
      message: 'sandbox is required.',
      allowedSandboxes: cfg.allowedSandboxes,
    };
  }
  if (!cfg.allowedSet.has(normalized)) {
    return {
      ok: false,
      message: `Sandbox "${sandbox}" is not allowed for this MCP server. Allowed: ${cfg.allowedSandboxes.join(', ')}.`,
      allowedSandboxes: cfg.allowedSandboxes,
    };
  }
  return { ok: true, sandbox: normalized };
}

/**
 * Phase 2 OAuth scaffold — not wired in Phase 1.
 * When enabled, validate Authorization: Bearer <JWT> against issuer/audience env vars.
 *
 * @param {import('express').Request} _req
 * @returns {{ ok: false, message: string }}
 */
export function validateOAuthBearer(_req) {
  return {
    ok: false,
    message:
      'OAuth bearer auth is not enabled in Phase 1. Use X-AEP-Lab-Mcp-Key. Set AEP_LAB_MCP_OAUTH_* env vars in a future release.',
  };
}

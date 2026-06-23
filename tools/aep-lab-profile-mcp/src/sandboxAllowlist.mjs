/**
 * Per-principal sandbox ACL — Firestore doc mcpSandboxAllowlist/{keyId} or env fallback.
 */

import { loadAuthConfig } from './auth.mjs';
import { getFirestoreDb } from './firestoreAdmin.mjs';

const COLLECTION = 'mcpSandboxAllowlist';

/** @type {Map<string, { allowedSandboxes: string[], allowedSet: Set<string>, principalLabel: string | null, source: string, fetchedAt: number }>} */
const cache = new Map();

const CACHE_TTL_MS = 60_000;

function normalizeSandboxList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function envFallbackAccess() {
  const cfg = loadAuthConfig();
  return {
    keyId: cfg.keyId,
    allowedSandboxes: cfg.allowedSandboxes,
    allowedSet: cfg.allowedSet,
    principalLabel: null,
    source: 'env',
  };
}

/**
 * Resolve sandbox allowlist for an API key id.
 * @param {string} keyId
 */
export async function resolvePrincipalAccess(keyId) {
  const id = String(keyId || '').trim() || 'unknown';
  const cached = cache.get(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      keyId: id,
      allowedSandboxes: cached.allowedSandboxes,
      allowedSet: cached.allowedSet,
      principalLabel: cached.principalLabel,
      source: cached.source,
    };
  }

  const db = await getFirestoreDb();
  if (db) {
    try {
      const snap = await db.collection(COLLECTION).doc(id).get();
      if (snap.exists) {
        const data = snap.data() || {};
        const allowedSandboxes = normalizeSandboxList(
          Array.isArray(data.allowedSandboxes) ? data.allowedSandboxes.join(',') : data.allowedSandboxes,
        );
        if (allowedSandboxes.length > 0) {
          const entry = {
            allowedSandboxes,
            allowedSet: new Set(allowedSandboxes),
            principalLabel: data.principalLabel ? String(data.principalLabel) : null,
            source: 'firestore',
            fetchedAt: Date.now(),
          };
          cache.set(id, entry);
          return { keyId: id, ...entry };
        }
      }
    } catch (err) {
      console.warn('[aep-lab-profile-mcp] sandbox allowlist Firestore read failed:', err?.message || err);
    }
  }

  const fallback = envFallbackAccess();
  cache.set(id, { ...fallback, fetchedAt: Date.now() });
  return fallback;
}

/**
 * @param {string | undefined | null} sandbox
 * @param {{ allowedSandboxes?: string[], allowedSet?: Set<string>, principalLabel?: string | null, source?: string }} access
 */
export function assertSandboxAllowedForAccess(sandbox, access) {
  const normalized = String(sandbox || '').trim().toLowerCase();
  const allowedSandboxes = access?.allowedSandboxes || [];
  const allowedSet = access?.allowedSet || new Set(allowedSandboxes);

  if (!normalized) {
    return {
      ok: false,
      message: 'sandbox is required.',
      allowedSandboxes,
    };
  }
  if (!allowedSet.has(normalized)) {
    return {
      ok: false,
      message: `Sandbox "${sandbox}" is not allowed for this MCP principal. Allowed: ${allowedSandboxes.join(', ')}.`,
      allowedSandboxes,
    };
  }
  return { ok: true, sandbox: normalized };
}

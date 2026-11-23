import { getAuth } from 'firebase-admin/auth';
import { getFirestoreDb } from './firestoreAdmin.mjs';
import { getPrincipalAccess } from './requestContext.mjs';
import { assertSandboxAllowed } from './auth.mjs';
import { requestContext } from './requestContext.mjs';

const OWNER_EMAIL = 'apalmer@adobe.com';

export async function assertOwnerReadSandbox(sandbox, options = {}) {
  const normal = assertSandboxAllowed(sandbox);
  if (normal.ok) return normal;
  const context = requestContext.getStore();
  const name = typeof sandbox === 'string' ? sandbox.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(name)
      || context?.authSource !== 'user' || !context.principalUid
      || !getPrincipalAccess()) return normal;
  const getOwner = options.getOwner || (async () => {
    if (!await getFirestoreDb()) throw new Error('Owner authorization store unavailable.');
    return getAuth().getUserByEmail(OWNER_EMAIL);
  });
  let owner;
  try {
    owner = await getOwner();
  } catch {
    console.error('[aep-lab-profile-mcp] Owner read authorization lookup failed.');
    throw new Error('Owner read authorization is unavailable.');
  }
  if (owner.uid !== context.principalUid || owner.disabled) return normal;
  return { ok: true, sandbox: name };
}

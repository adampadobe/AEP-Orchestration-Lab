import { AsyncLocalStorage } from 'node:async_hooks';

/** @type {AsyncLocalStorage<{ keyId: string, principalAccess?: import('./sandboxAllowlist.mjs').resolvePrincipalAccess extends (...args: any) => Promise<infer R> ? R : never }>} */
export const requestContext = new AsyncLocalStorage();

export function getRequestKeyId() {
  return requestContext.getStore()?.keyId ?? 'unknown';
}

export function getPrincipalAccess() {
  return requestContext.getStore()?.principalAccess ?? null;
}

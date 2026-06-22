import { AsyncLocalStorage } from 'node:async_hooks';

/** @type {AsyncLocalStorage<{ keyId: string }>} */
export const requestContext = new AsyncLocalStorage();

export function getRequestKeyId() {
  return requestContext.getStore()?.keyId ?? 'unknown';
}

'use strict';

/** Default Platform API host; optional regional hosts for lake/export (e.g. platform-nld2.adobe.io). */
const DEFAULT_PLATFORM_BASE_URL = 'https://platform.adobe.io';

/**
 * @param {unknown} raw
 * @returns {string} HTTPS origin only, no trailing slash
 */
function resolvePlatformBaseUrl(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_PLATFORM_BASE_URL;
  const s = String(raw).trim().replace(/\/+$/, '');
  let hostname = '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return DEFAULT_PLATFORM_BASE_URL;
    hostname = u.hostname.toLowerCase();
  } catch {
    return DEFAULT_PLATFORM_BASE_URL;
  }
  if (hostname === 'platform.adobe.io') return s;
  if (/^platform-[a-z0-9]+\.adobe\.io$/i.test(hostname)) return s;
  return DEFAULT_PLATFORM_BASE_URL;
}

module.exports = {
  DEFAULT_PLATFORM_BASE_URL,
  resolvePlatformBaseUrl,
};

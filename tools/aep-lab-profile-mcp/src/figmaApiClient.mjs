/**
 * Thin client for the Figma REST API (https://api.figma.com) using a
 * Personal Access Token in FIGMA_ACCESS_TOKEN. Reuses labApiClient's
 * retry/backoff/timeout handling. The token travels only in the
 * X-Figma-Token header; results never echo request headers.
 */

import { labApiRequest } from './labApiClient.mjs';

export const FIGMA_ORIGIN = 'https://api.figma.com';
const FIGMA_HOST_PATTERN = /(^|\.)figma\.com$/i;
const FILE_KEY_PATTERN = /^[A-Za-z0-9]{10,64}$/;

function token() {
  return String(process.env.FIGMA_ACCESS_TOKEN || '').trim();
}

export function isFigmaConfigured() {
  return token().length > 0;
}

/** Normalizes "1-2" (URL form) or "1:2" (API form) to the API form. */
export function normalizeNodeId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/-/g, ':');
}

/**
 * Parses Figma design/file/proto/board URLs, or accepts a bare file key.
 * Branch URLs (/design/:key/branch/:branchKey/...) resolve to the branch key.
 */
export function parseFigmaUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Provide a Figma URL or file key.' };
  if (FILE_KEY_PATTERN.test(raw)) return { ok: true, fileKey: raw, nodeId: null, kind: 'key' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Not a valid Figma URL or file key.' };
  }
  if (!FIGMA_HOST_PATTERN.test(url.hostname)) return { ok: false, error: 'URL host is not figma.com.' };

  const parts = url.pathname.split('/').filter(Boolean);
  const kindIndex = parts.findIndex((part) => ['design', 'file', 'proto', 'board', 'slides', 'deck'].includes(part));
  if (kindIndex === -1 || !parts[kindIndex + 1]) return { ok: false, error: 'URL does not contain a Figma file key.' };

  let fileKey = parts[kindIndex + 1];
  const branchIndex = parts.indexOf('branch', kindIndex);
  if (branchIndex !== -1 && parts[branchIndex + 1]) fileKey = parts[branchIndex + 1];
  if (!FILE_KEY_PATTERN.test(fileKey)) return { ok: false, error: 'URL file key has an unexpected format.' };

  const nodeParam = url.searchParams.get('node-id');
  return {
    ok: true,
    fileKey,
    nodeId: nodeParam ? normalizeNodeId(nodeParam) : null,
    kind: parts[kindIndex],
  };
}

/**
 * Resolves { url | file_key, node_id } tool input into an API file key and
 * node id. Explicit node_id wins over the URL's node-id parameter.
 */
export function resolveFigmaTarget({ url, file_key, node_id } = {}) {
  const source = file_key || url;
  const parsed = parseFigmaUrl(source);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    fileKey: parsed.fileKey,
    nodeId: node_id ? normalizeNodeId(node_id) : parsed.nodeId,
  };
}

/**
 * @param {string} path - Figma API path, e.g. /v1/me
 * @param {{ method?: string, query?: object, body?: object, timeoutMs?: number, retries?: number }} [opts]
 */
export async function figmaRequest(path, opts = {}) {
  const key = token();
  if (!key) {
    return { ok: false, status: 0, error: 'FIGMA_ACCESS_TOKEN is not configured on the server.', data: null };
  }
  const result = await labApiRequest(path, {
    origin: FIGMA_ORIGIN,
    method: opts.method || 'GET',
    query: opts.query,
    body: opts.body,
    timeoutMs: opts.timeoutMs ?? 60_000,
    retries: opts.retries,
    headers: { 'X-Figma-Token': key },
  });
  const data = result.data;
  const apiMessage = data && typeof data === 'object' ? (data.err || data.message || null) : null;
  return {
    ok: result.ok,
    status: result.status,
    data,
    error: result.ok ? null : (apiMessage || result.error || `Figma API request failed (${result.status})`),
  };
}

const enc = encodeURIComponent;

export const figmaApi = {
  me: () => figmaRequest('/v1/me'),
  file: (fileKey, { depth, ids, geometry } = {}) =>
    figmaRequest(`/v1/files/${enc(fileKey)}`, { query: { depth, ids, geometry } }),
  fileMeta: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/meta`),
  nodes: (fileKey, ids, { depth, geometry } = {}) =>
    figmaRequest(`/v1/files/${enc(fileKey)}/nodes`, { query: { ids, depth, geometry } }),
  renderImages: (fileKey, ids, { format, scale } = {}) =>
    figmaRequest(`/v1/images/${enc(fileKey)}`, { query: { ids, format, scale }, timeoutMs: 90_000 }),
  imageFills: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/images`),
  components: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/components`),
  componentSets: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/component_sets`),
  styles: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/styles`),
  localVariables: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/variables/local`),
  comments: (fileKey) => figmaRequest(`/v1/files/${enc(fileKey)}/comments`, { query: { as_md: true } }),
  postComment: (fileKey, body) =>
    figmaRequest(`/v1/files/${enc(fileKey)}/comments`, { method: 'POST', body, retries: 0 }),
  teamProjects: (teamId) => figmaRequest(`/v1/teams/${enc(teamId)}/projects`),
  projectFiles: (projectId) => figmaRequest(`/v1/projects/${enc(projectId)}/files`),
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const RENDER_HOST_PATTERN = /(^|\.)(figma\.com|amazonaws\.com|figmausercontent\.com)$/i;

/** Downloads a rendered image from Figma's CDN for inline MCP image content. */
export async function downloadRenderedImage(imageUrl, { timeoutMs = 30_000 } = {}) {
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return { ok: false, error: 'Invalid render URL.' };
  }
  if (url.protocol !== 'https:' || !RENDER_HOST_PATTERN.test(url.hostname)) {
    return { ok: false, error: 'Render URL host is not an expected Figma CDN host.' };
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { ok: false, error: `Render download failed (${response.status}).` };
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) return { ok: false, error: 'Rendered image is larger than 4 MB; lower the scale.' };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return { ok: false, error: 'Rendered image is larger than 4 MB; lower the scale.' };
    return { ok: true, base64: buffer.toString('base64'), mimeType: response.headers.get('content-type') || 'image/png', bytes: buffer.length };
  } catch (error) {
    return { ok: false, error: `Render download failed: ${error?.message || error}` };
  }
}

/**
 * Figma REST API tools (aep-lab-figma). Read tools wrap the Figma API with a
 * server-held Personal Access Token; the only write (posting a comment) is
 * gated by a preview → confirmation phrase handshake.
 */

import { createHash } from 'node:crypto';
import * as z from 'zod';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  downloadRenderedImage,
  figmaApi,
  isFigmaConfigured,
  normalizeNodeId,
  parseFigmaUrl,
  resolveFigmaTarget,
} from '../figmaApiClient.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const NOT_CONFIGURED = 'Figma is not configured on this server (FIGMA_ACCESS_TOKEN missing).';

const targetSchema = {
  url: z.string().max(2048).optional().describe('Figma file/design URL (node-id in the URL is used when node_id is omitted)'),
  file_key: z.string().max(128).optional().describe('Figma file key (alternative to url)'),
};
const nodeIdSchema = z.string().max(64).optional().describe('Node id, "1:2" or URL form "1-2"');

function audit(tool) {
  writeAuditLog({ keyId: getRequestKeyId(), tool });
}

function apiFailure(result, extra = {}) {
  const hints = {
    401: 'Token rejected; the Figma PAT may be expired or revoked.',
    403: 'Token lacks access to this resource (file not shared with the token owner, missing scope, or Enterprise-only endpoint).',
    404: 'File or node not found; check the file key and node id.',
    429: 'Figma rate limit hit; wait and retry with fewer calls.',
  };
  return toolError(result.error || 'Figma API request failed', {
    status: result.status,
    hint: hints[result.status],
    ...extra,
  });
}

function target(args) {
  if (!args.url && !args.file_key) return { ok: false, error: 'Provide url or file_key.' };
  return resolveFigmaTarget(args);
}

function splitIds(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(list.map((id) => normalizeNodeId(id)).filter(Boolean))];
}

// ── Node simplification ────────────────────────────────────────────────

function round(value) {
  return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
}

function hexColor(color, opacity = 1) {
  if (!color) return null;
  const channel = (v) => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0');
  const alpha = (color.a ?? 1) * opacity;
  const hex = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
  return alpha < 1 ? `${hex}${channel(alpha)}`.toUpperCase() : hex;
}

function simplifyPaints(paints) {
  if (!Array.isArray(paints) || !paints.length) return undefined;
  const out = paints
    .filter((paint) => paint.visible !== false)
    .map((paint) => {
      if (paint.type === 'SOLID') return { type: 'SOLID', color: hexColor(paint.color, paint.opacity ?? 1) };
      if (paint.type === 'IMAGE') return { type: 'IMAGE', imageRef: paint.imageRef, scaleMode: paint.scaleMode };
      if (String(paint.type).startsWith('GRADIENT')) {
        return {
          type: paint.type,
          stops: (paint.gradientStops || []).map((stop) => ({ position: round(stop.position), color: hexColor(stop.color) })),
        };
      }
      return { type: paint.type };
    });
  return out.length ? out : undefined;
}

function simplifyEffects(effects) {
  if (!Array.isArray(effects) || !effects.length) return undefined;
  const out = effects
    .filter((effect) => effect.visible !== false)
    .map((effect) => ({
      type: effect.type,
      radius: effect.radius,
      ...(effect.color ? { color: hexColor(effect.color) } : {}),
      ...(effect.offset ? { offset: effect.offset } : {}),
      ...(effect.spread ? { spread: effect.spread } : {}),
    }));
  return out.length ? out : undefined;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function bbox(node) {
  const box = node.absoluteBoundingBox;
  return box ? { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) } : undefined;
}

function designProps(node) {
  const style = node.style || {};
  const isText = node.type === 'TEXT';
  return compact({
    visible: node.visible === false ? false : undefined,
    bounds: bbox(node),
    opacity: node.opacity !== undefined && node.opacity !== 1 ? round(node.opacity) : undefined,
    layout: node.layoutMode && node.layoutMode !== 'NONE'
      ? compact({
          mode: node.layoutMode,
          wrap: node.layoutWrap,
          gap: node.itemSpacing,
          padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].some((v) => v)
            ? { top: node.paddingTop || 0, right: node.paddingRight || 0, bottom: node.paddingBottom || 0, left: node.paddingLeft || 0 }
            : undefined,
          primaryAlign: node.primaryAxisAlignItems,
          counterAlign: node.counterAxisAlignItems,
        })
      : undefined,
    sizing: node.layoutSizingHorizontal || node.layoutSizingVertical
      ? compact({ horizontal: node.layoutSizingHorizontal, vertical: node.layoutSizingVertical })
      : undefined,
    fills: simplifyPaints(node.fills),
    strokes: simplifyPaints(node.strokes),
    strokeWeight: node.strokes?.length ? node.strokeWeight : undefined,
    cornerRadius: node.cornerRadius,
    cornerRadii: node.rectangleCornerRadii,
    effects: simplifyEffects(node.effects),
    text: isText ? node.characters : undefined,
    typography: isText
      ? compact({
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontSize: style.fontSize,
          lineHeightPx: round(style.lineHeightPx),
          letterSpacing: style.letterSpacing ? round(style.letterSpacing) : undefined,
          textAlign: style.textAlignHorizontal,
          textCase: style.textCase,
          textDecoration: style.textDecoration,
        })
      : undefined,
    componentId: node.componentId,
    styles: node.styles && Object.keys(node.styles).length ? node.styles : undefined,
    boundVariables: node.boundVariables && Object.keys(node.boundVariables).length
      ? Object.keys(node.boundVariables)
      : undefined,
  });
}

/**
 * Walks a Figma node tree into a compact form. mode "metadata" keeps only
 * identity + bounds; mode "design" adds layout, paint, and typography.
 */
export function simplifyNodeTree(root, { mode = 'design', maxDepth = 6, maxNodes = 400 } = {}) {
  let count = 0;
  let truncated = false;
  const walk = (node, depth) => {
    if (count >= maxNodes) {
      truncated = true;
      return null;
    }
    count += 1;
    const base = { id: node.id, name: node.name, type: node.type };
    const props = mode === 'metadata' ? compact({ bounds: bbox(node), visible: node.visible === false ? false : undefined }) : designProps(node);
    const children = Array.isArray(node.children) ? node.children : [];
    const out = { ...base, ...props };
    if (children.length) {
      if (depth >= maxDepth) {
        out.childCount = children.length;
        truncated = true;
      } else {
        out.children = children.map((child) => walk(child, depth + 1)).filter(Boolean);
        if (out.children.length < children.length) out.childCount = children.length;
      }
    }
    return out;
  };
  const tree = walk(root, 0);
  return { tree, nodeCount: count, truncated };
}

// ── Comment write confirmation ─────────────────────────────────────────

export function commentPreflight({ fileKey, message, nodeId }) {
  const request = compact({ file_key: fileKey, message: String(message).trim(), node_id: nodeId || undefined });
  const preflightId = createHash('sha256')
    .update(JSON.stringify({ version: 1, operation: 'figma_post_comment', ...request }))
    .digest('hex');
  return {
    request,
    preflight_id: preflightId,
    confirmation: `POST FIGMA COMMENT ${preflightId.slice(0, 12).toUpperCase()}`,
  };
}

// ── Registration ───────────────────────────────────────────────────────

export function registerFigmaTools(mcpServer) {
  mcpServer.registerTool(
    'figma_whoami',
    {
      title: 'Figma: who am I',
      description: 'Confirm the Figma connection and return the account that owns the server token (id, handle, email).',
      inputSchema: {},
    },
    async () => {
      audit('figma_whoami');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const result = await figmaApi.me();
      if (!result.ok) return apiFailure(result);
      const { id, handle, email, img_url } = result.data || {};
      return jsonResult({ ok: true, user: { id, handle, email, img_url } });
    },
  );

  mcpServer.registerTool(
    'figma_parse_url',
    {
      title: 'Figma: parse URL',
      description: 'Extract the file key and node id from a Figma design/file/proto/board URL (no API call).',
      inputSchema: { url: z.string().max(2048) },
    },
    async ({ url }) => {
      audit('figma_parse_url');
      const parsed = parseFigmaUrl(url);
      if (!parsed.ok) return toolError(parsed.error);
      return jsonResult(parsed);
    },
  );

  mcpServer.registerTool(
    'figma_get_file',
    {
      title: 'Figma: file summary',
      description: 'File name, last modified, version, editor type, thumbnail and the list of pages with their top-level frames. Start here for an unknown file.',
      inputSchema: { ...targetSchema },
    },
    async (args) => {
      audit('figma_get_file');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const result = await figmaApi.file(t.fileKey, { depth: 2 });
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey });
      const file = result.data || {};
      const pages = (file.document?.children || []).map((page) => ({
        id: page.id,
        name: page.name,
        frames: (page.children || []).map((frame) => compact({ id: frame.id, name: frame.name, type: frame.type })),
      }));
      return jsonResult({
        ok: true,
        file_key: t.fileKey,
        name: file.name,
        lastModified: file.lastModified,
        version: file.version,
        editorType: file.editorType,
        role: file.role,
        thumbnailUrl: file.thumbnailUrl,
        componentCount: Object.keys(file.components || {}).length,
        styleCount: Object.keys(file.styles || {}).length,
        pages,
      });
    },
  );

  const treeInput = {
    ...targetSchema,
    node_id: nodeIdSchema,
    depth: z.number().int().min(1).max(12).optional().describe('Max tree depth to return (default varies by tool)'),
    max_nodes: z.number().int().min(10).max(2000).optional().describe('Cap on returned nodes (default 400)'),
  };

  async function loadTree(tool, args, mode, defaultDepth) {
    audit(tool);
    if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
    const t = target(args);
    if (!t.ok) return toolError(t.error);
    const maxDepth = args.depth ?? defaultDepth;
    const maxNodes = args.max_nodes ?? 400;
    // Fetch one level past the requested depth so childCount is accurate at the cutoff.
    const apiDepth = maxDepth + 1;
    if (t.nodeId) {
      const result = await figmaApi.nodes(t.fileKey, t.nodeId, { depth: apiDepth });
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey, node_id: t.nodeId });
      const entry = result.data?.nodes?.[t.nodeId];
      if (!entry?.document) return toolError('Node not found in file.', { file_key: t.fileKey, node_id: t.nodeId });
      const simplified = simplifyNodeTree(entry.document, { mode, maxDepth, maxNodes });
      return jsonResult({ ok: true, file_key: t.fileKey, node_id: t.nodeId, file_name: result.data?.name, ...simplified });
    }
    const result = await figmaApi.file(t.fileKey, { depth: Math.min(apiDepth, 4) });
    if (!result.ok) return apiFailure(result, { file_key: t.fileKey });
    const simplified = simplifyNodeTree(result.data?.document || {}, { mode, maxDepth: Math.min(maxDepth, 3), maxNodes });
    return jsonResult({
      ok: true,
      file_key: t.fileKey,
      file_name: result.data?.name,
      note: 'No node_id given: returning the shallow document tree. Pass node_id (or a URL with node-id) for a specific frame.',
      ...simplified,
    });
  }

  mcpServer.registerTool(
    'figma_get_metadata',
    {
      title: 'Figma: node structure',
      description: 'Sparse structural tree (id, name, type, bounds) for a node or the whole file. Use to locate frames and node ids before pulling design context.',
      inputSchema: treeInput,
    },
    async (args) => loadTree('figma_get_metadata', args, 'metadata', 4),
  );

  mcpServer.registerTool(
    'figma_get_design_context',
    {
      title: 'Figma: design context',
      description: 'Simplified design spec for a node subtree: auto-layout, sizing, fills/strokes as hex, corner radius, effects, text content and typography, component and variable bindings. Use for design-to-code or brand/content handoff.',
      inputSchema: treeInput,
    },
    async (args) => loadTree('figma_get_design_context', args, 'design', 6),
  );

  mcpServer.registerTool(
    'figma_get_screenshot',
    {
      title: 'Figma: render node',
      description: 'Render one or more nodes to PNG/JPG/SVG/PDF. Returns temporary render URLs (expire after ~30 days); with inline=true and a single PNG/JPG node, also returns the image inline.',
      inputSchema: {
        ...targetSchema,
        node_ids: z.union([z.string().max(1024), z.array(z.string().max(64)).max(50)]).optional()
          .describe('Node ids to render (comma list or array); defaults to node-id from the URL'),
        format: z.enum(['png', 'jpg', 'svg', 'pdf']).optional().describe('Default png'),
        scale: z.number().min(0.01).max(4).optional().describe('Default 1 (png/jpg only)'),
        inline: z.boolean().optional().describe('Return a single PNG/JPG render inline (≤4 MB)'),
      },
    },
    async (args) => {
      audit('figma_get_screenshot');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const ids = splitIds(args.node_ids);
      if (!ids.length && t.nodeId) ids.push(t.nodeId);
      if (!ids.length) return toolError('Provide node_ids or a URL containing node-id.');
      const format = args.format || 'png';
      const result = await figmaApi.renderImages(t.fileKey, ids.join(','), {
        format,
        scale: format === 'png' || format === 'jpg' ? (args.scale ?? 1) : undefined,
      });
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey, node_ids: ids });
      const images = result.data?.images || {};
      const renders = ids.map((id) => ({ node_id: id, url: images[id] || null }));
      const payload = { ok: true, file_key: t.fileKey, format, renders };
      const wantInline = args.inline && renders.length === 1 && renders[0].url && (format === 'png' || format === 'jpg');
      if (!wantInline) return jsonResult(payload);
      const download = await downloadRenderedImage(renders[0].url);
      if (!download.ok) return jsonResult({ ...payload, inline_error: download.error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ...payload, inline_bytes: download.bytes }, null, 2) },
          { type: 'image', data: download.base64, mimeType: download.mimeType },
        ],
      };
    },
  );

  mcpServer.registerTool(
    'figma_get_image_fills',
    {
      title: 'Figma: image fill URLs',
      description: 'Download URLs for every image used as a fill in the file, keyed by imageRef (matches fills[].imageRef from design context).',
      inputSchema: { ...targetSchema },
    },
    async (args) => {
      audit('figma_get_image_fills');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const result = await figmaApi.imageFills(t.fileKey);
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey });
      const images = result.data?.meta?.images || {};
      return jsonResult({ ok: true, file_key: t.fileKey, count: Object.keys(images).length, images });
    },
  );

  mcpServer.registerTool(
    'figma_get_components',
    {
      title: 'Figma: published components',
      description: 'Published components and component sets in a file (key, name, description, containing frame/page, node id).',
      inputSchema: { ...targetSchema },
    },
    async (args) => {
      audit('figma_get_components');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const [components, sets] = await Promise.all([figmaApi.components(t.fileKey), figmaApi.componentSets(t.fileKey)]);
      if (!components.ok) return apiFailure(components, { file_key: t.fileKey });
      const shape = (item) => compact({
        key: item.key,
        node_id: item.node_id,
        name: item.name,
        description: item.description,
        page: item.containing_frame?.pageName,
        frame: item.containing_frame?.name,
        component_set: item.containing_frame?.containingComponentSet?.name,
      });
      return jsonResult({
        ok: true,
        file_key: t.fileKey,
        components: (components.data?.meta?.components || []).map(shape),
        component_sets: sets.ok ? (sets.data?.meta?.component_sets || []).map(shape) : [],
        ...(sets.ok ? {} : { component_sets_error: sets.error }),
        note: 'Only published (library) components are listed. Unpublished local components appear in design context as componentId references.',
      });
    },
  );

  mcpServer.registerTool(
    'figma_get_styles',
    {
      title: 'Figma: styles',
      description: 'Color, text, effect, and grid styles defined in the file (published via API plus locally referenced styles).',
      inputSchema: { ...targetSchema },
    },
    async (args) => {
      audit('figma_get_styles');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const [published, file] = await Promise.all([figmaApi.styles(t.fileKey), figmaApi.file(t.fileKey, { depth: 1 })]);
      if (!published.ok && !file.ok) return apiFailure(published, { file_key: t.fileKey });
      const publishedStyles = published.ok
        ? (published.data?.meta?.styles || []).map((style) => compact({
            key: style.key,
            node_id: style.node_id,
            name: style.name,
            type: style.style_type,
            description: style.description,
          }))
        : [];
      const local = file.ok
        ? Object.entries(file.data?.styles || {}).map(([id, style]) => compact({
            id,
            key: style.key,
            name: style.name,
            type: style.styleType,
            description: style.description,
            remote: style.remote || undefined,
          }))
        : [];
      return jsonResult({ ok: true, file_key: t.fileKey, published: publishedStyles, file_styles: local });
    },
  );

  mcpServer.registerTool(
    'figma_get_variables',
    {
      title: 'Figma: variables / tokens',
      description: 'Local variable collections and variables (design tokens) with resolved values per mode. Requires a Figma Enterprise plan and the file_variables:read scope; returns a clear 403 otherwise.',
      inputSchema: { ...targetSchema },
    },
    async (args) => {
      audit('figma_get_variables');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const result = await figmaApi.localVariables(t.fileKey);
      if (!result.ok) {
        return apiFailure(result, {
          file_key: t.fileKey,
          fallback: 'Use figma_get_styles and figma_get_design_context (boundVariables) when the Variables API is unavailable.',
        });
      }
      const meta = result.data?.meta || {};
      const collections = Object.values(meta.variableCollections || {}).map((collection) => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes,
        remote: collection.remote || undefined,
      }));
      const modeNames = Object.fromEntries(
        Object.values(meta.variableCollections || {}).flatMap((c) => (c.modes || []).map((m) => [m.modeId, m.name])),
      );
      const variables = Object.values(meta.variables || {}).map((variable) => ({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collection: meta.variableCollections?.[variable.variableCollectionId]?.name,
        values: Object.fromEntries(
          Object.entries(variable.valuesByMode || {}).map(([modeId, value]) => [
            modeNames[modeId] || modeId,
            value && typeof value === 'object' && 'r' in value ? hexColor(value) : value,
          ]),
        ),
      }));
      return jsonResult({ ok: true, file_key: t.fileKey, collections, variables });
    },
  );

  mcpServer.registerTool(
    'figma_get_comments',
    {
      title: 'Figma: comments',
      description: 'Comments on a file (author, message, created/resolved time, pinned node). Optionally filter to unresolved.',
      inputSchema: {
        ...targetSchema,
        unresolved_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional().describe('Default 100'),
      },
    },
    async (args) => {
      audit('figma_get_comments');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const result = await figmaApi.comments(t.fileKey);
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey });
      let comments = result.data?.comments || [];
      if (args.unresolved_only) comments = comments.filter((c) => !c.resolved_at);
      const total = comments.length;
      comments = comments.slice(0, args.limit ?? 100).map((c) => compact({
        id: c.id,
        parent_id: c.parent_id || undefined,
        author: c.user?.handle,
        message: c.message,
        created_at: c.created_at,
        resolved_at: c.resolved_at || undefined,
        node_id: c.client_meta?.node_id,
        order_id: c.order_id,
      }));
      return jsonResult({ ok: true, file_key: t.fileKey, total, returned: comments.length, comments });
    },
  );

  const commentInput = {
    ...targetSchema,
    message: z.string().min(1).max(5000),
    node_id: nodeIdSchema,
  };

  mcpServer.registerTool(
    'figma_preview_comment',
    {
      title: 'Figma: preview comment',
      description: 'Preview posting a comment to a Figma file (optionally pinned to a node). Returns a preflight_id and an exact confirmation phrase; nothing is posted. Show the preview to the user and obtain approval before figma_post_comment.',
      inputSchema: commentInput,
    },
    async (args) => {
      audit('figma_preview_comment');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const preflight = commentPreflight({ fileKey: t.fileKey, message: args.message, nodeId: t.nodeId });
      return jsonResult({ ok: true, preview: true, ...preflight, next: 'Call figma_post_comment with the same inputs plus preflight_id and confirmation after the user approves.' });
    },
  );

  mcpServer.registerTool(
    'figma_post_comment',
    {
      title: 'Figma: post comment',
      description: 'Post a comment to a Figma file as the token owner. Requires preflight_id and the exact confirmation phrase from figma_preview_comment for identical inputs.',
      inputSchema: {
        ...commentInput,
        preflight_id: z.string().length(64),
        confirmation: z.string().max(64),
      },
    },
    async (args) => {
      audit('figma_post_comment');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const t = target(args);
      if (!t.ok) return toolError(t.error);
      const expected = commentPreflight({ fileKey: t.fileKey, message: args.message, nodeId: t.nodeId });
      if (args.preflight_id !== expected.preflight_id || args.confirmation !== expected.confirmation) {
        return toolError('Preflight mismatch: inputs changed or confirmation phrase is wrong. Run figma_preview_comment again.');
      }
      const body = { message: expected.request.message };
      if (t.nodeId) body.client_meta = { node_id: t.nodeId, node_offset: { x: 0, y: 0 } };
      const result = await figmaApi.postComment(t.fileKey, body);
      if (!result.ok) return apiFailure(result, { file_key: t.fileKey });
      return jsonResult({ ok: true, posted: true, file_key: t.fileKey, comment_id: result.data?.id, created_at: result.data?.created_at });
    },
  );

  mcpServer.registerTool(
    'figma_list_team_projects',
    {
      title: 'Figma: team projects',
      description: 'Projects in a Figma team. The team id is in team URLs (figma.com/files/team/<team_id>/...).',
      inputSchema: { team_id: z.string().regex(/^\d{1,32}$/) },
    },
    async ({ team_id }) => {
      audit('figma_list_team_projects');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const result = await figmaApi.teamProjects(team_id);
      if (!result.ok) return apiFailure(result, { team_id });
      return jsonResult({ ok: true, team_id, team_name: result.data?.name, projects: result.data?.projects || [] });
    },
  );

  mcpServer.registerTool(
    'figma_list_project_files',
    {
      title: 'Figma: project files',
      description: 'Files in a Figma project (key, name, thumbnail, last modified). Use the key with the other figma_* tools.',
      inputSchema: { project_id: z.string().regex(/^\d{1,32}$/) },
    },
    async ({ project_id }) => {
      audit('figma_list_project_files');
      if (!isFigmaConfigured()) return toolError(NOT_CONFIGURED);
      const result = await figmaApi.projectFiles(project_id);
      if (!result.ok) return apiFailure(result, { project_id });
      return jsonResult({ ok: true, project_id, project_name: result.data?.name, files: result.data?.files || [] });
    },
  );
}

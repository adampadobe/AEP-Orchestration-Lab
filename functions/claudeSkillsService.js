/**
 * Claude skills — shared lab catalog (Firebase Storage + Firestore + Vertex AI).
 *
 * Storage layout (bucket: CLAUDE_SKILLS_BUCKET or default Firebase bucket):
 *   claude-skills/{skillId}/{safeFileName}
 *
 * Public read via Firebase Hosting rewrite → claudeSkillsAsset (lab domain URL;
 * bytes live in GCS — same pattern as /cdn/** image hosting, not static web/):
 *   /skills/{skillId}/{relPath}
 *
 * Firestore collection `claudeSkills` (Admin SDK only; client rules deny writes).
 * Documents are created on publish; drafts exist only in Storage until published.
 */

'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const { callGemini, stripJsonFences } = require('./vertexClient');

const COLLECTION = 'claudeSkills';
const STORAGE_PREFIX = 'claude-skills';
/** Cloud Functions request body ~32 MiB; base64 adds ~33% overhead. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_BYTES = MAX_UPLOAD_BYTES;
const MAX_ZIP_ENTRIES = 100;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_STORAGE_PATH_DEPTH = 6;
const MAX_TEXT_ANALYZE_CHARS = 48_000;
const ACCEPTED_EXTENSIONS = new Set(['md', 'txt', 'json', 'yaml', 'yml']);
const ACCEPTED_UPLOAD_EXTENSIONS = new Set([...ACCEPTED_EXTENSIONS, 'zip']);

/**
 * Dedicated bucket optional. Otherwise uses the Firebase project default bucket
 * (`FIREBASE_CONFIG.storageBucket` or `{projectId}.firebasestorage.app`).
 * Do not fall back to legacy `{project}.appspot.com` — that bucket often does not
 * exist on modern Firebase projects (see web/profile-viewer/firebase-database-config.js).
 */

const ANALYZE_SYSTEM = `You analyze Claude Agent skill files for an internal Adobe lab catalog.
Respond with valid JSON only — no markdown fences, no prose outside the object.

Return exactly this shape:
{
  "category": "<short skill type e.g. workflow, integration, demo, research>",
  "valueSummary": "<2-3 sentences: business + technical value for AEP/architect audiences>",
  "title": "<suggested tile title, max 120 chars>",
  "description": "<suggested tile description, max 420 chars>",
  "tags": ["<lowercase tag>", "..."],
  "useCases": ["<when to use this skill, one line each>"],
  "sourcePath": "<repo path if inferable from content, else empty string>",
  "confidence": <number 0-1>
}

Rules:
- tags: 3-10 items, lowercase, no duplicates
- useCases: 1-8 items
- Infer sourcePath only when the file clearly references a path (SKILL.md, fullPath=, source:)
- confidence reflects how complete/readable the skill file is`;

const ANALYZE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    valueSummary: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    useCases: { type: 'array', items: { type: 'string' } },
    sourcePath: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['category', 'valueSummary', 'title', 'description', 'tags', 'useCases', 'confidence'],
};

/** Simple per-instance analyze throttle (IP → timestamps). */
const analyzeHits = new Map();
const ANALYZE_WINDOW_MS = 60_000;
const ANALYZE_MAX_PER_WINDOW = 12;

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function readFirebaseConfigField(field) {
  const raw = String(process.env.FIREBASE_CONFIG || '').trim();
  if (!raw) return '';
  try {
    return String(JSON.parse(raw)[field] || '').trim();
  } catch (_e) {
    return '';
  }
}

function resolveProjectId() {
  return String(
    process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || readFirebaseConfigField('projectId')
    || 'aep-orchestration-lab',
  ).trim();
}

/**
 * Bucket for claude-skills/* objects. Explicit env wins; else Firebase default.
 * @returns {string}
 */
function resolveClaudeSkillsBucketName() {
  const explicit = String(
    process.env.CLAUDE_SKILLS_BUCKET
    || process.env.FIREBASE_STORAGE_BUCKET
    || '',
  ).trim();
  if (explicit) return explicit;

  const fromFirebaseConfig = readFirebaseConfigField('storageBucket');
  if (fromFirebaseConfig) return fromFirebaseConfig;

  return `${resolveProjectId()}.firebasestorage.app`;
}

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(resolveClaudeSkillsBucketName());
}

function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function safeSegment(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
}

function safeStorageRelPath(relPath) {
  const parts = String(relPath || 'skill.md')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(safeSegment)
    .filter(Boolean);
  if (!parts.length) return 'skill.md';
  const trimmed = parts.length > MAX_STORAGE_PATH_DEPTH
    ? parts.slice(-MAX_STORAGE_PATH_DEPTH)
    : parts;
  const last = trimmed[trimmed.length - 1];
  const ext = extensionFromFileName(last);
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    trimmed[trimmed.length - 1] = `${safeSegment(last.replace(/\.[a-z0-9]+$/i, '') || 'skill')}.md`;
  }
  return trimmed.join('/');
}

function safeFileName(name) {
  return safeStorageRelPath(String(name || 'skill.md').replace(/\\/g, '/').split('/').pop() || 'skill.md');
}

function normalizeZipPath(entryPath) {
  return String(entryPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isUnsafeZipPath(name) {
  if (!name || name.includes('..')) return true;
  if (name.split('/').some((seg) => seg === '..')) return true;
  if (name.startsWith('__MACOSX/') || name === '__MACOSX') return true;
  const base = name.split('/').pop() || '';
  if (base === '.DS_Store' || base.startsWith('._')) return true;
  return false;
}

function pickPrimarySkillCandidate(files) {
  const byPath = (predicate) => files.find((f) => predicate(f.rawPath.toLowerCase()));

  const rootSkill = byPath((p) => p === 'skill.md');
  if (rootSkill) return rootSkill;

  const oneFolderSkill = files.filter((f) => /^[^/]+\/skill\.md$/.test(f.rawPath.toLowerCase()));
  if (oneFolderSkill.length === 1) return oneFolderSkill[0];

  const anySkill = files
    .filter((f) => /(^|\/)skill\.md$/i.test(f.rawPath))
    .sort((a, b) => a.rawPath.split('/').length - b.rawPath.split('/').length);
  if (anySkill.length) return anySkill[0];

  const markdown = files
    .filter((f) => f.ext === 'md')
    .sort((a, b) => {
      const depthDiff = a.rawPath.split('/').length - b.rawPath.split('/').length;
      if (depthDiff !== 0) return depthDiff;
      return a.rawPath.localeCompare(b.rawPath);
    });
  if (markdown.length) return markdown[0];

  return files[0];
}

async function extractSkillFromZip(zipBytes) {
  const unzipper = require('unzipper');
  let directory;
  try {
    directory = await unzipper.Open.buffer(zipBytes);
  } catch (_e) {
    const err = new Error('Invalid or corrupt ZIP file');
    err.status = 400;
    throw err;
  }

  const candidates = [];
  let fileEntryCount = 0;
  let totalUncompressed = 0;

  for (const zEntry of directory.files) {
    if (zEntry.type !== 'File') continue;
    fileEntryCount += 1;
    if (fileEntryCount > MAX_ZIP_ENTRIES) {
      const err = new Error(`ZIP has too many file entries (max ${MAX_ZIP_ENTRIES})`);
      err.status = 400;
      throw err;
    }

    const rawPath = normalizeZipPath(zEntry.path);
    if (isUnsafeZipPath(rawPath)) continue;

    const base = rawPath.split('/').pop() || '';
    if (!base || base.startsWith('.')) continue;

    const ext = extensionFromFileName(base);
    if (!ACCEPTED_EXTENSIONS.has(ext)) continue;

    const bytes = await zEntry.buffer();
    totalUncompressed += bytes.length;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      const err = new Error(
        `ZIP uncompressed content exceeds ${Math.round(MAX_ZIP_UNCOMPRESSED_BYTES / (1024 * 1024))} MB platform limit`,
      );
      err.status = 413;
      throw err;
    }

    candidates.push({ rawPath, ext, bytes });
  }

  if (!candidates.length) {
    const err = new Error('ZIP contains no skill files (.md, .txt, .json, .yaml, .yml)');
    err.status = 400;
    throw err;
  }

  const primary = pickPrimarySkillCandidate(candidates);
  return { primary, files: candidates };
}

function extensionFromFileName(fileName) {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function contentTypeForExt(ext) {
  const map = {
    md: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    json: 'application/json; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
  };
  return map[ext] || 'text/plain; charset=utf-8';
}

function storageObjectPath(skillId, fileName) {
  return `${STORAGE_PREFIX}/${skillId}/${safeStorageRelPath(fileName)}`;
}

function publicSkillUrl(skillId, fileName) {
  const rel = safeStorageRelPath(fileName);
  const encodedRel = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  return `/skills/${encodeURIComponent(skillId)}/${encodedRel}`;
}

function checkAnalyzeRateLimit(clientKey) {
  const key = String(clientKey || 'anonymous').slice(0, 120);
  const now = Date.now();
  let times = analyzeHits.get(key) || [];
  times = times.filter((t) => now - t < ANALYZE_WINDOW_MS);
  if (times.length >= ANALYZE_MAX_PER_WINDOW) {
    const err = new Error('Too many analyze requests. Wait a minute and try again.');
    err.code = 'RATE_LIMITED';
    err.status = 429;
    throw err;
  }
  times.push(now);
  analyzeHits.set(key, times);
  if (analyzeHits.size > 500) {
    for (const [k, v] of analyzeHits) {
      if (!v.some((t) => now - t < ANALYZE_WINDOW_MS)) analyzeHits.delete(k);
    }
  }
}

function decodeUploadBody(body) {
  const fileName = String(body.fileName || body.filename || 'skill.md').trim();
  const ext = extensionFromFileName(fileName);
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const isZip = ext === 'zip' || contentType.includes('zip');
  if (!isZip && !ACCEPTED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `Unsupported extension .${ext || '(none)'}. Use: ${[...ACCEPTED_UPLOAD_EXTENSIONS].join(', ')}`,
    );
    err.status = 400;
    throw err;
  }
  if (isZip && ext !== 'zip' && !ACCEPTED_EXTENSIONS.has(ext)) {
    const err = new Error('ZIP uploads must use a .zip file name');
    err.status = 400;
    throw err;
  }
  const b64 = String(body.contentBase64 || body.fileBase64 || '').trim();
  if (!b64) {
    const err = new Error('contentBase64 is required');
    err.status = 400;
    throw err;
  }
  let bytes;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch (_e) {
    const err = new Error('Invalid base64 content');
    err.status = 400;
    throw err;
  }
  if (!bytes.length) {
    const err = new Error('Empty file');
    err.status = 400;
    throw err;
  }
  const maxBytes = isZip ? MAX_ZIP_BYTES : MAX_UPLOAD_BYTES;
  if (bytes.length > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const err = new Error(
      isZip
        ? `ZIP archive exceeds ${maxMb} MB platform upload limit`
        : `File exceeds ${maxMb} MB platform upload limit`,
    );
    err.status = 413;
    throw err;
  }
  return { fileName, ext: isZip ? 'zip' : ext, bytes, isZip };
}

async function saveSkillObject(bucket, skillId, relPath, bytes, ext, originalName) {
  const safeRel = safeStorageRelPath(relPath);
  const path = storageObjectPath(skillId, safeRel);
  const file = bucket.file(path);
  await file.save(bytes, {
    contentType: contentTypeForExt(ext),
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=0, must-revalidate',
      metadata: { skillId, originalName: originalName || relPath },
    },
  });
  return {
    fileName: safeRel,
    storagePath: path,
    publicUrl: publicSkillUrl(skillId, safeRel),
    extension: ext,
    size: bytes.length,
  };
}

async function uploadSkillFile(body) {
  const { fileName, ext, bytes, isZip } = decodeUploadBody(body);
  const skillId = String(body.skillId || '').trim() || genId();
  const bucket = getBucket();

  if (isZip) {
    const { primary, files } = await extractSkillFromZip(bytes);
    const storedFiles = [];
    for (const entry of files) {
      storedFiles.push(await saveSkillObject(
        bucket,
        skillId,
        entry.rawPath,
        entry.bytes,
        entry.ext,
        entry.rawPath,
      ));
    }
    const primaryRel = safeStorageRelPath(primary.rawPath);
    const primaryStored = storedFiles.find((f) => f.fileName === primaryRel)
      || await saveSkillObject(bucket, skillId, primary.rawPath, primary.bytes, primary.ext, primary.rawPath);
    const text = primary.bytes.toString('utf8');
    return {
      ok: true,
      skillId,
      fileName: primaryStored.fileName,
      storagePath: primaryStored.storagePath,
      publicUrl: primaryStored.publicUrl,
      extension: primary.ext,
      size: primary.bytes.length,
      textPreview: text.slice(0, 2000),
      extractedFromZip: true,
      zipFileName: fileName,
      files: storedFiles,
    };
  }

  const saved = await saveSkillObject(bucket, skillId, fileName, bytes, ext, fileName);
  const text = bytes.toString('utf8');
  return {
    ok: true,
    skillId,
    fileName: saved.fileName,
    storagePath: saved.storagePath,
    publicUrl: saved.publicUrl,
    extension: ext,
    size: bytes.length,
    textPreview: text.slice(0, 2000),
  };
}

async function readSkillText(skillId, storagePath) {
  const bucket = getBucket();
  const path = storagePath || storageObjectPath(skillId, 'skill.md');
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    const err = new Error('Skill file not found in storage');
    err.status = 404;
    throw err;
  }
  const [buf] = await file.download();
  return buf.toString('utf8');
}

async function analyzeSkillText(text, fileName, clientKey) {
  checkAnalyzeRateLimit(clientKey);
  const excerpt = String(text || '').slice(0, MAX_TEXT_ANALYZE_CHARS);
  if (!excerpt.trim()) {
    const err = new Error('No text to analyze');
    err.status = 400;
    throw err;
  }
  const userPrompt = [
    `File name: ${fileName || 'skill.md'}`,
    '',
    'Skill file content:',
    excerpt,
  ].join('\n');

  const model = process.env.VERTEX_GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
  let raw;
  try {
    raw = await callGemini(ANALYZE_SYSTEM, userPrompt, {
      model,
      maxOutputTokens: 4096,
      temperature: 0.2,
      jsonMode: true,
      responseSchema: ANALYZE_RESPONSE_SCHEMA,
      retryOn429: true,
      retryOn429DelayMs: 15000,
      retryOn429Attempts: 1,
    });
  } catch (e) {
    if (e.code === 'RATE_LIMITED') throw e;
    const err = new Error(`Vertex AI analysis failed: ${String(e && e.message || e)}`);
    err.status = 502;
    throw err;
  }

  const cleaned = stripJsonFences(raw);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_e) {
    const err = new Error('Vertex AI returned invalid JSON');
    err.status = 502;
    throw err;
  }

  const tags = Array.isArray(parsed.tags)
    ? [...new Set(parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12)
    : [];
  const useCases = Array.isArray(parsed.useCases)
    ? parsed.useCases.map((u) => String(u).trim()).filter(Boolean).slice(0, 10)
    : [];
  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));

  return {
    ok: true,
    model,
    analysis: {
      category: String(parsed.category || '').trim().slice(0, 80),
      valueSummary: String(parsed.valueSummary || '').trim().slice(0, 1200),
      title: String(parsed.title || '').trim().slice(0, 120),
      description: String(parsed.description || '').trim().slice(0, 420),
      tags,
      useCases,
      sourcePath: String(parsed.sourcePath || '').trim().slice(0, 500),
      confidence,
    },
  };
}

async function analyzeSkill(body, clientKey) {
  const skillId = String(body.skillId || '').trim();
  let text = String(body.text || '').trim();
  const fileName = String(body.fileName || 'skill.md').trim();

  if (!text && skillId) {
    text = await readSkillText(skillId, body.storagePath);
  }
  return analyzeSkillText(text, fileName, clientKey);
}

function catalogDocToTile(id, data) {
  return {
    id,
    name: data.name || data.title || 'Untitled skill',
    description: data.description || '',
    useCases: data.useCases || [],
    tags: data.tags || [],
    sourcePath: data.sourcePath || '',
    category: data.category || '',
    valueSummary: data.valueSummary || '',
    confidence: data.confidence,
    extension: data.extension || '',
    fileName: data.fileName || '',
    storagePath: data.storagePath || '',
    publicUrl: data.publicUrl || publicSkillUrl(id, data.fileName || 'skill.md'),
    createdAt: data.createdAt || null,
    publishedAt: data.publishedAt || null,
  };
}

async function listCatalog() {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('status', '==', 'published')
    .get();
  const items = [];
  snap.forEach((d) => {
    items.push(catalogDocToTile(d.id, d.data() || {}));
  });
  items.sort((a, b) => String(b.publishedAt || b.createdAt || '').localeCompare(String(a.publishedAt || a.createdAt || '')));
  return { ok: true, items };
}

async function publishSkill(body) {
  const skillId = String(body.skillId || '').trim();
  if (!skillId) {
    const err = new Error('skillId is required');
    err.status = 400;
    throw err;
  }
  const name = String(body.name || body.title || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  const fileName = safeFileName(body.fileName || 'skill.md');
  const storagePath = String(body.storagePath || '').trim() || storageObjectPath(skillId, fileName);
  const ext = extensionFromFileName(fileName);
  const now = new Date().toISOString();

  const record = {
    status: 'published',
    name,
    description: String(body.description || '').trim().slice(0, 2000),
    useCases: Array.isArray(body.useCases)
      ? body.useCases.map((u) => String(u).trim()).filter(Boolean).slice(0, 10)
      : [],
    tags: Array.isArray(body.tags)
      ? [...new Set(body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12)
      : parseTagsCsv(body.tags),
    sourcePath: String(body.sourcePath || '').trim().slice(0, 500),
    category: String(body.category || '').trim().slice(0, 80),
    valueSummary: String(body.valueSummary || '').trim().slice(0, 1200),
    confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
    fileName,
    storagePath,
    publicUrl: publicSkillUrl(skillId, fileName),
    extension: ext || 'md',
    publishedAt: now,
    updatedAt: now,
  };

  const ref = getDb().collection(COLLECTION).doc(skillId);
  const existing = await ref.get();
  if (!existing.exists) {
    record.createdAt = now;
  }
  await ref.set(record, { merge: true });

  return { ok: true, skill: catalogDocToTile(skillId, { ...record, createdAt: record.createdAt || existing.data()?.createdAt }) };
}

function parseTagsCsv(raw) {
  if (Array.isArray(raw)) return raw;
  return String(raw || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

async function deleteSkill(skillId) {
  const id = String(skillId || '').trim();
  if (!id) {
    const err = new Error('id is required');
    err.status = 400;
    throw err;
  }
  const ref = getDb().collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (doc.exists) {
    const data = doc.data() || {};
    const bucket = getBucket();
    if (data.storagePath) {
      try { await bucket.file(data.storagePath).delete({ ignoreNotFound: true }); } catch (_e) { /* best effort */ }
    }
    await ref.delete();
  }
  return { ok: true, id };
}

function resolveAsset(reqPath) {
  const p = String(reqPath || '').replace(/^\/skills\//, '').replace(/^\/+/, '');
  const parts = p.split('/').filter(Boolean);
  if (parts.length < 2) {
    const err = new Error('bad path');
    err.status = 400;
    throw err;
  }
  const skillId = decodeURIComponent(parts.shift());
  const relFile = parts.map(decodeURIComponent).join('/');
  if (!relFile || relFile.includes('..')) {
    const err = new Error('bad path');
    err.status = 400;
    throw err;
  }
  const storagePath = `${STORAGE_PREFIX}/${skillId}/${relFile}`;
  return { skillId, storagePath, file: getBucket().file(storagePath) };
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  ACCEPTED_EXTENSIONS,
  ACCEPTED_UPLOAD_EXTENSIONS,
  resolveClaudeSkillsBucketName,
  resolveProjectId,
  extractSkillFromZip,
  pickPrimarySkillCandidate,
  uploadSkillFile,
  analyzeSkill,
  listCatalog,
  publishSkill,
  deleteSkill,
  resolveAsset,
  publicSkillUrl,
};

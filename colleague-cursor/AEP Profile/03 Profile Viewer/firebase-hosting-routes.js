/**
 * Local folder tree + optional Firebase Hosting upload/deploy — Profile Viewer server.
 * Env: LOCAL_HOSTING_FOLDER (absolute path on this machine for the tree), or FIREBASE_HOSTING_PUBLIC, or firebase.json.
 * Deploy: FIREBASE_PROJECT_DIR (folder with firebase.json). Runs `firebase deploy --only hosting --non-interactive`
 * via PATH unless FIREBASE_CLI points to an executable.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';

function resolveProjectDir() {
  const raw = process.env.FIREBASE_PROJECT_DIR;
  if (!raw || !String(raw).trim()) return null;
  return path.resolve(String(raw).trim());
}

/** Arguments after the executable: `deploy --only hosting --non-interactive` (standard Firebase Hosting deploy, no prompts). */
const DEPLOY_ARGS = ['deploy', '--only', 'hosting', '--non-interactive'];

/**
 * FIREBASE_CLI or FIREBASE_CLI_PATH: full path to firebase-tools-win.exe, or leave unset to use `firebase` on PATH.
 */
function resolveFirebaseCli() {
  const raw = (process.env.FIREBASE_CLI || process.env.FIREBASE_CLI_PATH || '').trim();
  if (!raw) {
    return {
      ok: true,
      cmd: 'firebase',
      args: DEPLOY_ARGS,
      shell: true,
      display: 'firebase (PATH)',
    };
  }
  const resolved = path.resolve(raw);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return {
      ok: true,
      cmd: resolved,
      args: DEPLOY_ARGS,
      shell: false,
      display: resolved,
    };
  }
  const looksLikePath =
    /^[a-zA-Z]:[\\/]/.test(raw) ||
    raw.startsWith('/') ||
    raw.startsWith('\\\\') ||
    (raw.includes(path.sep) && raw.length > 2);
  if (looksLikePath) {
    return { ok: false, missingPath: resolved, display: resolved };
  }
  return {
    ok: true,
    cmd: raw,
    args: DEPLOY_ARGS,
    shell: true,
    display: raw,
  };
}

function readFirebaseJson(projectDir) {
  const p = path.join(projectDir, 'firebase.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function resolveHostingPublicDir() {
  const localFolder = process.env.LOCAL_HOSTING_FOLDER;
  if (localFolder && String(localFolder).trim()) {
    return path.resolve(String(localFolder).trim());
  }
  const override = process.env.FIREBASE_HOSTING_PUBLIC;
  if (override && String(override).trim()) {
    return path.resolve(String(override).trim());
  }
  const projectDir = resolveProjectDir();
  if (!projectDir) return null;
  const cfg = readFirebaseJson(projectDir);
  if (!cfg || !cfg.hosting) return null;
  const h = Array.isArray(cfg.hosting) ? cfg.hosting[0] : cfg.hosting;
  const pub = h && typeof h.public === 'string' ? h.public : 'public';
  return path.resolve(projectDir, pub);
}

function slugSegment(s) {
  return String(s)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function folderSlug(relFolder) {
  const parts = String(relFolder || '')
    .split(/[/\\]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(slugSegment)
    .filter(Boolean);
  return parts.length ? parts.join('-') : 'root';
}

function safeJoinUnder(base, rel) {
  const baseResolved = path.resolve(base);
  const relNorm = String(rel || '')
    .replace(/^\//, '')
    .replace(/\.\./g, '')
    .trim();
  const target = path.resolve(baseResolved, relNorm);
  if (!target.startsWith(baseResolved)) {
    throw new Error('Invalid path');
  }
  return target;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Destination filenames per folder (original upload names are ignored). Always .png.
 * `fs.writeFileSync` replaces any existing file with the same name.
 */
function outputNamesForFolder(folderRel, fileCount) {
  if (!fileCount || fileCount < 1) {
    return { error: 'No files.' };
  }
  const seg = path
    .basename(String(folderRel || '').replace(/\\/g, '/').replace(/\/+$/, ''))
    .toLowerCase();

  if (!seg) {
    const names = [];
    for (let i = 0; i < fileCount; i++) {
      names.push(`file${i + 1}.png`);
    }
    return { names };
  }

  if (seg === 'logos') {
    if (fileCount > 1) {
      return { error: 'Logos folder accepts only one file (saved as logo.png).' };
    }
    return { names: ['logo.png'] };
  }

  if (seg === 'banners') {
    const names = [];
    for (let i = 0; i < fileCount; i++) {
      names.push(i === 0 ? 'banner.png' : `banner${i}.png`);
    }
    return { names };
  }

  if (seg === 'products') {
    const names = [];
    for (let i = 0; i < fileCount; i++) {
      names.push(`product${i + 1}.png`);
    }
    return { names };
  }

  const slug = seg.replace(/[^a-z0-9_-]+/g, '') || 'file';
  const names = [];
  for (let i = 0; i < fileCount; i++) {
    names.push(`${slug}${i + 1}.png`);
  }
  return { names };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const DEPLOY_LOG_MAX = 100000;

function truncateDeployLog(s) {
  const t = String(s || '');
  if (t.length <= DEPLOY_LOG_MAX) return t;
  return `${t.slice(0, DEPLOY_LOG_MAX)}\n\n… [truncated]`;
}

let deployRunning = false;
let deployStartedAt = null;
/** @type {null | { ok: boolean, code?: number, stdout?: string, stderr?: string, error?: string, hint?: string, finishedAt: string }} */
let lastDeployResult = null;

/** JSON body: { folder, from, to } — renames a file under the hosting public folder (single-segment names only). */
export function hostingRenameHandler(req, res) {
  try {
    const folderRel = String(req.body?.folder ?? '')
      .trim()
      .replace(/\\/g, '/');
    const fromRaw = String(req.body?.from ?? '').trim();
    const toRaw = String(req.body?.to ?? '').trim();
    if (!folderRel || !fromRaw || !toRaw) {
      return res.status(400).json({ error: 'Missing folder, from, or to.' });
    }
    const safeFrom = path.basename(fromRaw.replace(/\\/g, '/'));
    const safeTo = path.basename(toRaw.replace(/\\/g, '/'));
    if (!safeFrom || !safeTo) {
      return res.status(400).json({ error: 'Invalid file name.' });
    }
    if (safeFrom !== fromRaw.replace(/\\/g, '/') || safeTo !== toRaw.replace(/\\/g, '/')) {
      return res.status(400).json({ error: 'Use a simple file name only (no path).' });
    }
    if (fromRaw.includes('..') || toRaw.includes('..')) {
      return res.status(400).json({ error: 'Invalid file name.' });
    }
    const root = resolveHostingPublicDir();
    if (!root || !fs.existsSync(root)) {
      return res.status(400).json({ error: 'Hosting public folder not configured or missing.' });
    }
    const dir = safeJoinUnder(root, folderRel);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ error: 'Folder not found.' });
    }
    const fromAbs = path.join(dir, safeFrom);
    const toAbs = path.join(dir, safeTo);
    const dirResolved = path.resolve(dir);
    const relFrom = path.relative(dirResolved, path.resolve(fromAbs));
    const relTo = path.relative(dirResolved, path.resolve(toAbs));
    if (
      !relFrom ||
      relFrom.startsWith('..') ||
      path.isAbsolute(relFrom) ||
      !relTo ||
      relTo.startsWith('..') ||
      path.isAbsolute(relTo)
    ) {
      return res.status(400).json({ error: 'Invalid path.' });
    }
    if (!fs.existsSync(fromAbs) || !fs.statSync(fromAbs).isFile()) {
      return res.status(404).json({ error: 'Source file not found.' });
    }
    if (fs.existsSync(toAbs)) {
      return res.status(409).json({ error: 'A file with that name already exists.' });
    }
    fs.renameSync(fromAbs, toAbs);
    return res.json({ ok: true, folder: folderRel, from: safeFrom, to: safeTo });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Rename failed' });
  }
}

export function registerFirebaseHostingRoutes(app) {
  app.use('/api/hosting', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/hosting/status', (req, res) => {
    const hosting = resolveHostingPublicDir();
    const proj = resolveProjectDir();
    const hostingExists = hosting ? fs.existsSync(hosting) : false;
    const hostingTreeOk = !!(hosting && hostingExists);
    const firebaseJsonExists = proj ? fs.existsSync(path.join(proj, 'firebase.json')) : false;
    const cli = resolveFirebaseCli();
    const deployReady = !!(proj && firebaseJsonExists && cli.ok);
    res.json({
      ok: !!(hosting && proj && fs.existsSync(proj)),
      deployReady,
      deployInProgress: deployRunning,
      deployStartedAt: deployRunning ? deployStartedAt : null,
      lastDeploy: lastDeployResult,
      hostingTreeOk,
      hostingRootName: hosting ? path.basename(hosting) : null,
      projectDir: proj || null,
      hostingPublicDir: hosting || null,
      hostingExists,
      firebaseJsonExists,
      firebaseCliResolved: cli.ok,
      firebaseCliDisplay: cli.ok ? cli.display : null,
      firebaseCliMissingPath: cli.ok ? null : cli.missingPath,
    });
  });

  app.get('/api/hosting/raw', (req, res) => {
    try {
      const root = resolveHostingPublicDir();
      if (!root || !fs.existsSync(root)) {
        return res.status(404).end();
      }
      const rel = String(req.query.rel || '').replace(/\.\./g, '');
      const abs = safeJoinUnder(root, rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return res.status(404).end();
      }
      const ext = path.extname(abs).toLowerCase();
      const mime =
        {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.bmp': 'image/bmp',
          '.avif': 'image/avif',
        }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.sendFile(abs);
    } catch (e) {
      res.status(400).send(e.message || 'Bad request');
    }
  });

  app.get('/api/hosting/files', (req, res) => {
    try {
      const root = resolveHostingPublicDir();
      if (!root || !fs.existsSync(root)) {
        return res.status(400).json({ error: 'Hosting public folder not configured or missing.' });
      }
      const rel = String(req.query.folder || '').replace(/\.\./g, '');
      const dir = safeJoinUnder(root, rel);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return res.json({ folder: rel, entries: [] });
      }
      const names = fs.readdirSync(dir, { withFileTypes: true });
      const entries = names.map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
      }));
      return res.json({ folder: rel, entries });
    } catch (e) {
      return res.status(400).json({ error: e.message || 'List failed' });
    }
  });

  /**
   * Upload into selected folder: body.folder = relative path (e.g. logos, banners).
   * Names are folder-based (e.g. logos→logo.png; banners→banner.png, banner1.png, …); existing files are replaced.
   */
  app.post('/api/hosting/upload-to-folder', (req, res) => {
    upload.array('files', 100)(req, res, (multerErr) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message || 'Upload parse failed' });
      }
      try {
        const root = resolveHostingPublicDir();
        if (!root || !fs.existsSync(root)) {
          return res.status(400).json({ error: 'Hosting public folder not configured or missing.' });
        }
        const folderRel = String(req.body.folder ?? '')
          .trim()
          .replace(/\\/g, '/');
        if (!folderRel) {
          return res.status(400).json({ error: 'Select a folder in the tree (missing folder path).' });
        }
        const files = req.files || [];
        if (!files.length) {
          return res.status(400).json({ error: 'No files uploaded.' });
        }
        const destDir = safeJoinUnder(root, folderRel);
        ensureDir(destDir);
        const plan = outputNamesForFolder(folderRel, files.length);
        if (plan.error) {
          return res.status(400).json({ error: plan.error });
        }
        const written = [];
        plan.names.forEach((outName, i) => {
          const file = files[i];
          const buf = file.buffer || file.data;
          if (!buf) {
            throw new Error('Empty file buffer');
          }
          const outPath = path.join(destDir, outName);
          fs.writeFileSync(outPath, buf);
          written.push({ name: outName, path: path.relative(root, outPath).replace(/\\/g, '/') });
        });
        return res.json({ ok: true, count: written.length, files: written, folder: folderRel });
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Upload failed' });
      }
    });
  });

  app.post('/api/hosting/upload', upload.array('files', 100), (req, res) => {
    try {
      const root = resolveHostingPublicDir();
      if (!root || !fs.existsSync(root)) {
        return res.status(400).json({ error: 'Hosting public folder not configured or missing.' });
      }

      const targetFolder = String(req.body.targetFolder || '').trim();
      const namingMode = String(req.body.namingMode || 'keep').trim();

      if (namingMode === 'logoPng') {
        const destDir = safeJoinUnder(root, 'logos');
        ensureDir(destDir);
        const files = req.files || [];
        const file = files[0];
        if (!file) {
          return res.status(400).json({ error: 'No file uploaded.' });
        }
        const outPath = path.join(destDir, 'logo.png');
        fs.writeFileSync(outPath, file.buffer);
        const relPath = path.relative(root, outPath).replace(/\\/g, '/');
        return res.json({
          ok: true,
          count: 1,
          files: [{ name: 'logo.png', path: relPath }],
        });
      }

      const destDir = safeJoinUnder(root, targetFolder);
      ensureDir(destDir);

      const slug = folderSlug(targetFolder);
      const files = req.files || [];
      const written = [];

      files.forEach((file, i) => {
        const orig = file.originalname || 'file';
        const ext = path.extname(orig) || '.bin';
        const base = path.basename(orig, ext);

        let outName;
        if (namingMode === 'folderPrefix') {
          outName = `${slug}-${slugSegment(base) || 'file'}${ext}`;
        } else if (namingMode === 'folderOnly') {
          outName = files.length > 1 ? `${slug}-${i + 1}${ext}` : `${slug}${ext}`;
        } else {
          const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
          outName = safeBase + ext;
        }

        const outPath = path.join(destDir, outName);
        fs.writeFileSync(outPath, file.buffer);
        written.push({ name: outName, path: path.relative(root, outPath).replace(/\\/g, '/') });
      });

      return res.json({ ok: true, count: written.length, files: written });
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Upload failed' });
    }
  });

  app.post('/api/hosting/deploy', (req, res) => {
    const proj = resolveProjectDir();
    if (!proj || !fs.existsSync(path.join(proj, 'firebase.json'))) {
      return res.status(400).json({ error: 'FIREBASE_PROJECT_DIR invalid or firebase.json missing.' });
    }
    const cli = resolveFirebaseCli();
    if (!cli.ok) {
      return res.status(400).json({
        error: `FIREBASE_CLI not found: ${cli.missingPath}`,
        hint: 'Set FIREBASE_CLI to the full path of firebase-tools-win.exe (or install firebase-tools globally).',
      });
    }
    if (deployRunning) {
      return res.status(409).json({ error: 'Deploy already in progress.' });
    }

    deployRunning = true;
    deployStartedAt = new Date().toISOString();
    const chunks = [];
    const errChunks = [];
    let responded = false;

    const child = spawn(cli.cmd, cli.args, {
      cwd: proj,
      shell: cli.shell,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    child.stdout.on('data', (d) => chunks.push(d.toString()));
    child.stderr.on('data', (d) => errChunks.push(d.toString()));

    function recordLastDeploy(payload) {
      const finishedAt = new Date().toISOString();
      lastDeployResult = {
        ok: !!payload.ok,
        code: typeof payload.code === 'number' ? payload.code : payload.ok ? 0 : -1,
        stdout: truncateDeployLog(payload.stdout || ''),
        stderr: truncateDeployLog(payload.stderr || ''),
        error: payload.error || undefined,
        hint: payload.hint || undefined,
        finishedAt,
      };
      deployRunning = false;
      deployStartedAt = null;
    }

    function finish(payload, status) {
      if (responded) return;
      responded = true;
      recordLastDeploy(payload);
      res.status(status || 200).json(payload);
    }

    child.on('close', (code) => {
      const out = chunks.join('');
      const err = errChunks.join('');
      finish({
        ok: code === 0,
        code,
        stdout: out,
        stderr: err,
      });
    });

    child.on('error', (e) => {
      finish(
        {
          ok: false,
          code: -1,
          stdout: '',
          stderr: '',
          error: e.message,
          hint:
            'Set FIREBASE_CLI to the full path of firebase-tools-win.exe, or install firebase-tools: npm install -g firebase-tools',
        },
        500
      );
    });
  });
}

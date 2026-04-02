/**
 * Local server: writes uploads into Firebase Hosting public folder, runs `firebase deploy --only hosting`.
 * Configure FIREBASE_PROJECT_DIR and optionally FIREBASE_HOSTING_PUBLIC in .env
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3847;

function resolveProjectDir() {
  const raw = process.env.FIREBASE_PROJECT_DIR;
  if (!raw || !String(raw).trim()) {
    return null;
  }
  return path.resolve(String(raw).trim());
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

/** Hosting public directory from firebase.json or env override */
function resolveHostingPublicDir() {
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

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.redirect('/hosting.html');
});

const publicRoot = resolveHostingPublicDir();
const projectDir = resolveProjectDir();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname)));

app.get('/api/hosting/status', (req, res) => {
  const hosting = resolveHostingPublicDir();
  const proj = resolveProjectDir();
  res.json({
    ok: !!(hosting && proj && fs.existsSync(proj)),
    projectDir: proj || null,
    hostingPublicDir: hosting || null,
    hostingExists: hosting ? fs.existsSync(hosting) : false,
    firebaseJsonExists: proj ? fs.existsSync(path.join(proj, 'firebase.json')) : false,
  });
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

app.post('/api/hosting/upload', upload.array('files', 100), (req, res) => {
  try {
    const root = resolveHostingPublicDir();
    if (!root || !fs.existsSync(root)) {
      return res.status(400).json({ error: 'Hosting public folder not configured or missing.' });
    }

    const targetFolder = String(req.body.targetFolder || '').trim();
    const namingMode = String(req.body.namingMode || 'keep').trim();

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
        outName =
          files.length > 1 ? `${slug}-${i + 1}${ext}` : `${slug}${ext}`;
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

let deployRunning = false;

app.post('/api/hosting/deploy', (req, res) => {
  const proj = resolveProjectDir();
  if (!proj || !fs.existsSync(path.join(proj, 'firebase.json'))) {
    return res.status(400).json({ error: 'FIREBASE_PROJECT_DIR invalid or firebase.json missing.' });
  }
  if (deployRunning) {
    return res.status(409).json({ error: 'Deploy already in progress.' });
  }

  deployRunning = true;
  const chunks = [];
  const errChunks = [];
  let responded = false;

  const child = spawn('firebase deploy --only hosting --non-interactive', {
    cwd: proj,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout.on('data', (d) => chunks.push(d.toString()));
  child.stderr.on('data', (d) => errChunks.push(d.toString()));

  function finish(payload, status) {
    if (responded) return;
    responded = true;
    deployRunning = false;
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
        error: e.message,
        hint: 'Is Firebase CLI installed? Run: npm install -g firebase-tools',
      },
      500
    );
  });
});

app.listen(PORT, () => {
  console.log(`Firebase Hosting manager: http://localhost:${PORT}/hosting.html`);
  if (!publicRoot) {
    console.warn('Warning: Set FIREBASE_PROJECT_DIR (and optionally FIREBASE_HOSTING_PUBLIC) in .env');
  } else {
    console.log(`Hosting files directory: ${publicRoot}`);
  }
  if (projectDir) {
    console.log(`Firebase project (deploy): ${projectDir}`);
  }
});

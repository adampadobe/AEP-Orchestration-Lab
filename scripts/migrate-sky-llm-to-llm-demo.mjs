/**
 * One-time migration: sky-llm-snapshot → demos/llm-demo/snapshot, sky-llm-snapshot-* → llm-demo-snapshot-*.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldSnap = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const newSnap = path.join(repoRoot, 'web', 'profile-viewer', 'demos', 'llm-demo', 'snapshot');
const pvRoot = path.join(repoRoot, 'web', 'profile-viewer');

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, cb);
    else cb(fp);
  }
}

if (fs.existsSync(oldSnap) && !fs.existsSync(newSnap)) {
  fs.mkdirSync(path.dirname(newSnap), { recursive: true });
  fs.renameSync(oldSnap, newSnap);
  console.log('Moved snapshot folder');
} else if (fs.existsSync(newSnap)) {
  console.log('Snapshot folder already at demos/llm-demo/snapshot');
} else {
  console.error('No snapshot folder found');
  process.exit(1);
}

for (const name of fs.readdirSync(newSnap)) {
  if (!name.startsWith('sky-llm-snapshot-')) continue;
  const from = path.join(newSnap, name);
  const to = path.join(newSnap, name.replace(/^sky-llm-snapshot-/, 'llm-demo-snapshot-'));
  if (!fs.existsSync(to)) fs.renameSync(from, to);
}

const oldFrame = path.join(pvRoot, 'sky-llm-optimizer.css');
const newFrame = path.join(pvRoot, 'demos', 'llm-demo', 'llm-demo-frame.css');
if (fs.existsSync(oldFrame) && !fs.existsSync(newFrame)) {
  fs.mkdirSync(path.dirname(newFrame), { recursive: true });
  fs.renameSync(oldFrame, newFrame);
  console.log('Moved llm-demo-frame.css');
}

const toDelete = [];
walk(pvRoot, (fp) => {
  const base = path.basename(fp);
  if (/^sky-llm-.*\.html$/i.test(base) && !fp.includes('demos\\llm-demo\\snapshot')) toDelete.push(fp);
});
if (fs.existsSync(path.join(pvRoot, 'sky-llm-optimizer.js'))) toDelete.push(path.join(pvRoot, 'sky-llm-optimizer.js'));

for (const fp of toDelete) {
  fs.unlinkSync(fp);
  console.log('deleted', path.relative(repoRoot, fp));
}

const replaceRoots = [
  path.join(repoRoot, 'web', 'profile-viewer'),
  path.join(repoRoot, 'scripts'),
  path.join(repoRoot, 'package.json'),
];

const replacements = [
  ['../../sky-llm-snapshot/', './snapshot/'],
  ['../sky-llm-snapshot/', './snapshot/'],
  ['sky-llm-snapshot/', 'demos/llm-demo/snapshot/'],
  ['sky-llm-snapshot-', 'llm-demo-snapshot-'],
  ['SKY_LLM_SNAPSHOT_BUILD', 'LLM_DEMO_SNAPSHOT_BUILD'],
  ['sky-llm-optimizer-frame', 'llm-demo-frame'],
  ['sky-llm-optimizer.css', 'llm-demo-frame.css'],
  ['Sky — Adobe Brand Visibility', 'Adobe Brand Visibility'],
  ['Sky LLM Optimizer', 'Adobe Brand Visibility'],
  ['sky llm', 'llm demo'],
];

function patchFile(fp) {
  if (!fs.existsSync(fp)) return;
  let text = fs.readFileSync(fp, 'utf8');
  const orig = text;
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  if (text !== orig) {
    fs.writeFileSync(fp, text, 'utf8');
    console.log('patched', path.relative(repoRoot, fp));
  }
}

walk(path.join(repoRoot, 'web', 'profile-viewer'), (fp) => {
  if (/\.(js|html|css|json|mjs)$/i.test(fp)) patchFile(fp);
});
walk(path.join(repoRoot, 'scripts'), (fp) => {
  if (/\.mjs$/i.test(fp) && !fp.includes('migrate-sky-llm-to-llm-demo')) patchFile(fp);
});
patchFile(path.join(repoRoot, 'package.json'));

try {
  execSync('git add -A web/profile-viewer scripts/package.json package.json', { cwd: repoRoot, stdio: 'inherit' });
} catch (e) {
  /* optional */
}

console.log('Migration complete');

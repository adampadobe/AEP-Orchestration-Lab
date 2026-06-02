/**
 * Download per-colour hero images and merge heroImagesByColour into jlr-models.json.
 * Run: node scripts/fetch-jlr-colour-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/jlr-colour-images.manifest.json');
const jsonPath = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/jlr-models.json');
const outDir = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/catalogue');

const REFERER = 'https://www.landrover.co.uk/';

function resolveModelColours(manifest, modelId) {
  const entry = manifest.models[modelId];
  if (!entry) return null;
  const out = {};
  if (entry.inherit && manifest[entry.inherit]) {
    Object.assign(out, manifest[entry.inherit]);
  }
  if (entry.overrides) Object.assign(out, entry.overrides);
  for (const [colour, url] of Object.entries(entry)) {
    if (colour === 'inherit' || colour === 'overrides') continue;
    out[colour] = url;
  }
  return out;
}

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: {
      Referer: REFERER,
      'User-Agent': 'AEP-Orchestration-Lab/1.0 (internal demo asset fetch)',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const remoteCache = new Map();
let downloaded = 0;

for (const model of data.models) {
  const remoteByColour = resolveModelColours(manifest, model.id);
  if (!remoteByColour) continue;

  const heroImagesByColour = {};
  for (const [colour, remote] of Object.entries(remoteByColour)) {
    if (!remote || !/^https?:\/\//i.test(remote)) continue;
    const filename = `${model.id}-${colour}.jpg`;
    const localRel = `jlr-demo-assets/catalogue/${filename}`;
    const localAbs = path.join(outDir, filename);

    if (!fs.existsSync(localAbs)) {
      try {
        let buf = remoteCache.get(remote);
        if (!buf) {
          buf = await fetchImage(remote);
          remoteCache.set(remote, buf);
          downloaded += 1;
          console.log('fetched', remote.split('/').pop(), `(${buf.length} bytes)`);
        }
        fs.writeFileSync(localAbs, buf);
        console.log('saved', filename);
      } catch (err) {
        console.error('FAIL', model.id, colour, err.message);
        continue;
      }
    }

    heroImagesByColour[colour] = localRel;
  }

  if (Object.keys(heroImagesByColour).length) {
    model.heroImagesByColour = heroImagesByColour;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log(`Done: ${downloaded} remote fetches, ${data.models.length} models in JSON`);

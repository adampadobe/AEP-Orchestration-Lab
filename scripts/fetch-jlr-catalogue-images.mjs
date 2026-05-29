/**
 * Download JLR catalogue hero images for same-origin hosting (CDN blocks hotlink from lab).
 * Run after CSV/build changes: node scripts/fetch-jlr-catalogue-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const jsonPath = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/jlr-models.json');
const outDir = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/catalogue');

const REFERER = 'https://www.landrover.co.uk/';

function extFromUrl(url, contentType) {
  if (/\.jpe?g/i.test(url)) return '.jpg';
  if (/\.png/i.test(url)) return '.png';
  if (/\.webp/i.test(url)) return '.webp';
  if (contentType && contentType.includes('png')) return '.png';
  if (contentType && contentType.includes('webp')) return '.webp';
  return '.jpg';
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
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  return { buf, ext: extFromUrl(url, ct) };
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const urlCache = new Map();
let ok = 0;
let skip = 0;
let fail = 0;

for (const model of data.models) {
  const remote = model.heroImageRemote || model.heroImage;
  if (!remote || !/^https?:\/\//i.test(remote)) {
    skip += 1;
    continue;
  }

  let cached = urlCache.get(remote);
  if (!cached) {
    const outBase = path.join(outDir, model.id);
    const existing = ['.jpg', '.jpeg', '.png', '.webp']
      .map((e) => `${outBase}${e}`)
      .find((p) => fs.existsSync(p));
    if (existing) {
      cached = path.basename(existing);
      urlCache.set(remote, cached);
    } else {
      try {
        const { buf, ext } = await fetchImage(remote);
        const filename = `${model.id}${ext}`;
        fs.writeFileSync(path.join(outDir, filename), buf);
        cached = filename;
        urlCache.set(remote, cached);
        ok += 1;
        console.log('saved', filename, `(${buf.length} bytes)`);
      } catch (err) {
        console.error('FAIL', model.id, remote, err.message);
        fail += 1;
        continue;
      }
    }
  }

  model.heroImageRemote = remote;
  model.heroImage = `jlr-demo-assets/catalogue/${cached}`;
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log(`Done: ${ok} downloaded, ${skip} skipped, ${fail} failed, ${data.models.length} models in JSON`);

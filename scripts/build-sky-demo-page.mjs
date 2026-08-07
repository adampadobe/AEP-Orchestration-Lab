import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(repoRoot, 'web', 'profile-viewer', 'sky-demo.html');
const snapshotPath = path.join(
  repoRoot,
  'web',
  'profile-viewer',
  'sky-demo-assets',
  'sky-home-snapshot.html',
);

const marker = (name, edge) => `<!-- SKY_${name}_${edge} -->`;

function between(source, name) {
  const start = marker(name, 'START');
  const end = marker(name, 'END');
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing ${name} markers in ${path.relative(repoRoot, pagePath)}`);
  }
  return source.slice(startIndex + start.length, endIndex).trim();
}

function tagAttributes(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}\\b([^>]*)>`, 'i'));
  if (!match) throw new Error(`Snapshot is missing <${tagName}>`);
  return match[1].trim();
}

function tagContents(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'));
  if (!match) throw new Error(`Snapshot is missing <${tagName}> contents`);
  return match[1];
}

function withoutScripts(source) {
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
}

function rewriteSnapshotAssetPaths(source) {
  return source.replace(
    /(?:\.\/)?sky-home-snapshot_files\//g,
    'sky-demo-assets/sky-home-snapshot_files/',
  );
}

function attributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function withoutAttribute(attributes, name) {
  return attributes.replace(new RegExp(`\\s*\\b${name}=(['"]).*?\\1`, 'i'), '').trim();
}

function mergeBodyAttributes(snapshotAttributes) {
  const snapshotClasses = attributeValue(snapshotAttributes, 'class').split(/\s+/).filter(Boolean);
  const labClasses = ['mod-demo-page', 'sky-demo-page', 'home-dashboard-concierge'];
  const classes = [...new Set([...snapshotClasses, ...labClasses])].join(' ');
  const rest = withoutAttribute(snapshotAttributes, 'class');
  return `class="${classes}"${rest ? ` ${rest}` : ''}`;
}

const [shell, snapshot] = await Promise.all([
  fs.readFile(pagePath, 'utf8'),
  fs.readFile(snapshotPath, 'utf8'),
]);

const labHead = between(shell, 'LAB_HEAD');
const labBodyBefore = between(shell, 'LAB_BODY_BEFORE');
const labBodyAfter = between(shell, 'LAB_BODY_AFTER');
const snapshotHead = rewriteSnapshotAssetPaths(withoutScripts(tagContents(snapshot, 'head'))).trim();
const snapshotBody = rewriteSnapshotAssetPaths(withoutScripts(tagContents(snapshot, 'body'))).trim();
const htmlAttributes = tagAttributes(snapshot, 'html');
const bodyAttributes = mergeBodyAttributes(tagAttributes(snapshot, 'body'));

const output = `<!DOCTYPE html>
<!-- decisioning-mounts: dynamic-only (sky-home preset — same-document AJO authoring) -->
<html ${htmlAttributes}>
<head>
  ${marker('LAB_HEAD', 'START')}
${labHead}
  ${marker('LAB_HEAD', 'END')}
${snapshotHead}
<link rel="stylesheet" href="sky-demo-assets/sky-home-runtime.css?v=20260807-ajo-authoring">
</head>
<body ${bodyAttributes}>
  ${marker('LAB_BODY_BEFORE', 'START')}
${labBodyBefore}
  ${marker('LAB_BODY_BEFORE', 'END')}

  <div id="skyDemoSiteRoot" class="sky-demo-site-root" role="main" aria-label="Sky homepage demo">
    ${marker('SNAPSHOT_CONTENT', 'START')}
${snapshotBody}
    ${marker('SNAPSHOT_CONTENT', 'END')}
  </div>

  ${marker('LAB_BODY_AFTER', 'START')}
${labBodyAfter}
  ${marker('LAB_BODY_AFTER', 'END')}
</body>
</html>
`;

await fs.writeFile(pagePath, output, 'utf8');
console.log(`Built ${path.relative(repoRoot, pagePath)} from ${path.relative(repoRoot, snapshotPath)}`);

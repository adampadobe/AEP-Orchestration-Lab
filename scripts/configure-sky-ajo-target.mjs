import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(
  repoRoot,
  'web',
  'profile-viewer',
  'sky-demo-assets',
  'sky-home-snapshot.html',
);

const authoringScript =
  '<script defer src="../sky-demo-ajo-target.js?v=20260807-main-authoring-bridge"></script>';
const existingAuthoringScriptPattern =
  /<script\s+defer\s+src="\.\.\/sky-demo-ajo-target\.js\?v=[^"]+"><\/script>/i;
const capturedLaunchPattern =
  /<script\s+src="sky-home-snapshot_files\/launch-ENd6c8a33809694f8684febbdf83b39af8\.min\.js\.download"\s+async=""><\/script>/i;
const disabledCapturedLaunch =
  '<script type="application/x-sky-captured-launch" data-disabled-src="sky-home-snapshot_files/launch-ENd6c8a33809694f8684febbdf83b39af8.min.js.download"></script>';
const dynamicCapturedLaunchPattern =
  /<script\s+id="sky-tracking"[^>]*>[\s\S]*?<\/script>/i;
const disabledDynamicCapturedLaunch =
  '<script type="application/x-sky-captured-launch" id="sky-tracking-disabled" data-disabled-sky-tracking="true"></script>';
const capturedLaunchUrl =
  'https://assets.adobedtm.com/launch-ENd6c8a33809694f8684febbdf83b39af8.min.js';
const disabledCapturedLaunchUrl = 'data:text/javascript,void%200';

let html = await fs.readFile(snapshotPath, 'utf8');

if (capturedLaunchPattern.test(html)) {
  html = html.replace(capturedLaunchPattern, disabledCapturedLaunch);
}

if (dynamicCapturedLaunchPattern.test(html)) {
  html = html.replace(dynamicCapturedLaunchPattern, disabledDynamicCapturedLaunch);
}

html = html.replaceAll(capturedLaunchUrl, disabledCapturedLaunchUrl);

if (existingAuthoringScriptPattern.test(html)) {
  html = html.replace(existingAuthoringScriptPattern, authoringScript);
} else if (!html.includes('sky-demo-ajo-target.js')) {
  const headEnd = html.toLowerCase().lastIndexOf('</head>');
  if (headEnd < 0) throw new Error('Sky snapshot does not contain </head>');
  html = `${html.slice(0, headEnd)}${authoringScript}${html.slice(headEnd)}`;
}

await fs.writeFile(snapshotPath, html, 'utf8');
console.log(`Configured constrained AJO target in ${path.relative(repoRoot, snapshotPath)}`);

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
const postLoginSnapshotPath = path.join(
  repoRoot,
  'web',
  'profile-viewer',
  'sky-demo-assets',
  'sky-post-login.html',
);

const authoringScript =
  '<script defer src="../sky-demo-ajo-target.js?v=20260807-editable-main-insert"></script>';
const postLoginPersonalisationScript =
  '<script defer src="../sky-demo-post-login.js?v=20260813-profile-name"></script>';
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

const loginMarkup =
  '<!-- sky-demo-login:start -->' +
  '<link rel="stylesheet" href="../site-clone-login.css?v=20260813-sky-post-login">' +
  '<script>window.SiteCloneLoginConfig={"labSource":"sky-lab","shellSource":"sky-demo-shell","brandName":"Sky","title":"Sign in to My Sky","subtitle":"Access your profile, TV packages, and personalised offers across Sky services.","logoSrc":"https://static.skyassets.com/contentstack/assets/blt143e20b03d72047e/blt604739917da2cb2e/68c00eada726cbc539e1838b/sky.png","logoWidth":120,"logoHeight":42,"accentColor":"#0072c9","accentHoverColor":"#0056a0","btnTop":"16px","profileNotFoundMessage":"No Sky profile found for that email. Check the address and try again.","postLoginUrl":"sky-post-login.html","postLoginDelayMs":600};</script>' +
  '<script src="../site-clone-login.js?v=20260813-sky-post-login"></script>' +
  '<!-- sky-demo-login:end -->';

function disableCapturedTracking(html, assetFolder) {
  const escapedFolder = assetFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const localLaunchPattern = new RegExp(
    '<script\\s+src="(?:\\./)?' + escapedFolder + '\\/launch-[^"]+\\.min\\.js\\.download"[^>]*><\\/script>',
    'gi',
  );
  html = html.replace(
    localLaunchPattern,
    '<script type="application/x-sky-captured-launch" data-disabled-sky-tracking="true"></script>',
  );
  if (dynamicCapturedLaunchPattern.test(html)) {
    html = html.replace(dynamicCapturedLaunchPattern, disabledDynamicCapturedLaunch);
  }
  return html.replaceAll(capturedLaunchUrl, disabledCapturedLaunchUrl);
}

function ensureScriptInHead(html, scriptMarkup, marker = 'sky-demo-ajo-target.js') {
  if (html.includes(marker)) return html;
  const headEnd = html.toLowerCase().lastIndexOf('</head>');
  if (headEnd < 0) throw new Error('Sky snapshot does not contain </head>');
  return `${html.slice(0, headEnd)}${scriptMarkup}${html.slice(headEnd)}`;
}

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
} else {
  html = ensureScriptInHead(html, authoringScript);
}

html = html.replace(/<!-- sky-demo-login:start -->[\s\S]*?<!-- sky-demo-login:end -->/gi, '');
html = html.replace(/<link\s+rel="stylesheet"\s+href="\.\.\/site-clone-login\.css\?v=[^"]+">/gi, '');
html = html.replace(/<script>window\.SiteCloneLoginConfig=[\s\S]*?<\/script>/gi, '');
html = html.replace(/<script\s+src="\.\.\/site-clone-login\.js\?v=[^"]+"><\/script>/gi, '');
const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('Sky snapshot does not contain </body>');
html = `${html.slice(0, bodyEnd)}${loginMarkup}${html.slice(bodyEnd)}`;

await fs.writeFile(snapshotPath, html, 'utf8');

let postLoginHtml = await fs.readFile(postLoginSnapshotPath, 'utf8');
postLoginHtml = disableCapturedTracking(postLoginHtml, 'SkyPostLogin_files');
postLoginHtml = ensureScriptInHead(postLoginHtml, authoringScript);
if (!postLoginHtml.includes('sky-demo-post-login.js')) {
  postLoginHtml = ensureScriptInHead(
    postLoginHtml,
    postLoginPersonalisationScript,
    'sky-demo-post-login.js',
  );
}

const localPostLoginImages = [
  ['2025_June_MSA_Latest_Deals_Hero_White_world.png'],
  ['2026_Q1_Jan_UnderSaltMarsh_Glass_Gen_2_Pod_desktop.jpg'],
  ['TT_02_UnderSaltMarsh_S01.png'],
  ['KA_01_DyersCaravanPark_S01-C2.jpg'],
  ['SkyWitness_5.png'],
  ['KA_Last_Week_Tonight_With_John_Oliver_S13_3-4-C2.jpg'],
  ['KA_01_NTLive-DrStrangelove-C2.jpg'],
  ['KA_01_CharmedByTheDevil_S01-C2.jpg'],
  ['KA_01_ChevyChase_P-C2.jpg'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_Bridgerton_Watch_now_v1.png', 'netflix-bridgerton.png'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_People_We_Meet_On_Vacation_v1.png', 'netflix-people-we-meet-on-vacation.png'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_Run_Away_v1.png', 'netflix-run-away.png'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_Seven_Dials_v1.png', 'netflix-seven-dials.png'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_Take_That_v1.png', 'netflix-take-that.png'],
  ['2026_Q1_January_Netflix_Content_Updates_CHP_Content_Cards_The_Rip_v1.png', 'netflix-the-rip.png'],
];
for (const [imageName, localName = imageName] of localPostLoginImages) {
  const escapedName = imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remoteImage = new RegExp(
    'https:\\/\\/static\\.skyassets\\.com\\/[^"\'<>\\s]*\\/' + escapedName + '(?:\\?[^"\'<>\\s]*)?',
    'gi',
  );
  postLoginHtml = postLoginHtml.replace(remoteImage, `SkyPostLogin_files/${localName}`);
  if (localName !== imageName) {
    postLoginHtml = postLoginHtml.replaceAll(`SkyPostLogin_files/${imageName}`, `SkyPostLogin_files/${localName}`);
  }
}

await fs.writeFile(postLoginSnapshotPath, postLoginHtml, 'utf8');
console.log(
  `Configured constrained AJO targets in ${path.relative(repoRoot, snapshotPath)} and ${path.relative(repoRoot, postLoginSnapshotPath)}`,
);

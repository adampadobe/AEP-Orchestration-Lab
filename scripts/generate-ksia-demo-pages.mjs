#!/usr/bin/env node
/**
 * Generates KSIA demo HTML pages from templates.
 * Run: node scripts/generate-ksia-demo-pages.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'web', 'profile-viewer', 'demos', 'ksia');
const BUILD = '20260612';

const PAGES = [
  { file: 'about.html', id: 'about', custom: true },
  { file: 'flights/index.html', id: 'flights-hub', custom: true },
  { file: 'flights/arrivals.html', id: 'flights-arrivals', custom: true },
  { file: 'flights/departures.html', id: 'flights-departures', custom: true },
  { file: 'at-the-airport/index.html', id: 'at-the-airport-hub', custom: true },
  { file: 'at-the-airport/terminal-guide.html', id: 'terminal-guide', custom: true },
  { file: 'at-the-airport/terminal-1.html', id: 'terminal-1', custom: true },
  { file: 'at-the-airport/terminal-2.html', id: 'terminal-2', custom: true },
  { file: 'at-the-airport/terminal-3.html', id: 'terminal-3', custom: true },
  { file: 'at-the-airport/terminal-4.html', id: 'terminal-4', custom: true },
  { file: 'at-the-airport/terminal-5.html', id: 'terminal-5', custom: true },
  { file: 'at-the-airport/terminal-6.html', id: 'terminal-6', custom: true },
  { file: 'at-the-airport/maps.html', id: 'maps', custom: true },
  { file: 'at-the-airport/security.html', id: 'security', custom: true },
  { file: 'at-the-airport/services/index.html', id: 'services-hub', custom: true },
  { file: 'at-the-airport/services/lounges.html', id: 'lounges', custom: true },
  { file: 'at-the-airport/services/special-assistance.html', id: 'special-assistance', custom: true },
  { file: 'transport/index.html', id: 'transport-hub', custom: true },
  { file: 'transport/parking.html', id: 'parking', custom: true },
  { file: 'transport/drop-off.html', id: 'drop-off', custom: true },
  { file: 'transport/public-transport.html', id: 'public-transport', custom: true },
  { file: 'shop-dine/index.html', id: 'shop-dine-hub', custom: true },
  { file: 'shop-dine/duty-free.html', id: 'duty-free', custom: true },
  { file: 'shop-dine/restaurants.html', id: 'restaurants', custom: true },
  { file: 'aivc/index.html', id: 'aivc-hub', custom: true },
  { file: 'aivc/wallet-setup.html', id: 'wallet-setup', custom: true },
  { file: 'aivc/disruption-compensation.html', id: 'disruption-compensation', custom: true },
  { file: 'media.html', id: 'media', custom: true },
  { file: 'contact.html', id: 'contact', custom: true },
];

function prefixFor(file) {
  const depth = (file.match(/\//g) || []).length;
  return depth ? '../'.repeat(depth) : '';
}

function hubLinksHtml(links, pfx) {
  if (!links || !links.length) return '';
  return (
    '<section class="ksia-hub-links"><h2 class="ksia-section-title">Explore</h2><ul class="ksia-link-grid">' +
    links
      .map((href) => {
        const label = href.split('/').pop().replace('.html', '').replace(/-/g, ' ');
        return `<li><a href="${pfx}${href}" class="ksia-card-link">${label.charAt(0).toUpperCase() + label.slice(1)}</a></li>`;
      })
      .join('') +
    '</ul></section>'
  );
}

function boardHtml(type) {
  const rows =
    type === 'arrivals'
      ? [
          ['SV 102', 'London LHR', '14:25', 'T1', 'Landed'],
          ['EK 815', 'Dubai DXB', '15:10', 'T2', 'On time'],
          ['QR 1188', 'Doha DOH', '15:45', 'T1', 'Delayed'],
          ['BA 263', 'London LHR', '16:20', 'T3', 'On time'],
        ]
      : [
          ['SV 103', 'London LHR', '17:05', 'T1', 'Boarding'],
          ['EK 816', 'Dubai DXB', '17:40', 'T2', 'On time'],
          ['QR 1189', 'Doha DOH', '18:15', 'T1', 'On time'],
          ['BA 264', 'London LHR', '19:00', 'T3', 'Gate open'],
        ];
  const col2 = type === 'arrivals' ? 'From' : 'To';
  return (
    '<section class="ksia-flight-board">' +
    '<table class="ksia-board-table"><thead><tr><th>Flight</th><th>' +
    col2 +
    '</th><th>Time</th><th>Terminal</th><th>Status</th></tr></thead><tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td><span class="ksia-status">${r[4]}</span></td></tr>`,
      )
      .join('') +
    '</tbody></table></section>'
  );
}

function pageContent(page) {
  const heading = page.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let body =
    '<header class="ksia-page-header"><h1 class="ksia-page-title">' +
    heading +
    '</h1><p class="ksia-page-lead">King Salman International Airport — ' +
    heading +
    '.</p></header>';

  if (page.stub) {
    body += '<p class="ksia-stub-note">This terminal page is a placeholder stub for the KSIA POC. Full content will be added in a future pass.</p>';
  }
  if (page.board) body += boardHtml(page.board);
  if (page.hubLinks) body += hubLinksHtml(page.hubLinks, prefixFor(page.file));
  if (page.aivc) {
    body +=
      '<div class="ksia-aivc-cta"><button type="button" class="ksia-btn ksia-btn-primary" id="ksiaAivcDemoBtn">Try AIVC action</button></div>' +
      '<script>document.getElementById("ksiaAivcDemoBtn")&&document.getElementById("ksiaAivcDemoBtn").addEventListener("click",function(){window.KsiaLabEvents&&window.KsiaLabEvents.emitAivcAction("wallet-demo");});</script>';
  }
  if (!page.board && !page.hubLinks && !page.stub && !page.aivc) {
    body += '<section class="ksia-content-block"><p>Content for this section of the KSIA airport website POC. Navigation, lab strip integration, and AEP event emission are fully wired.</p></section>';
  }
  return body;
}

function wrapPage({ file, id, title, bodyExtra, extraScripts }) {
  const pfx = prefixFor(file);
  const pageTitle = title || 'King Salman International Airport';
  const body = bodyExtra != null ? bodyExtra : pageContent({ file, id });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} — King Salman International Airport</title>
  <link rel="stylesheet" href="${pfx}ksia-site.css?v=${BUILD}">
</head>
<body class="ksia-site" data-ksia-page-id="${id}">
  <div id="ksia-chrome-mount"></div>
  <main class="ksia-main" id="ksia-main">
${body}
  </main>
  <script src="${pfx}ksia-mock-data.js?v=${BUILD}"></script>
  <script src="${pfx}ksia-events.js?v=${BUILD}"></script>
  <script src="${pfx}ksia-chrome.js?v=${BUILD}"></script>
  <script src="${pfx}ksia-journey-chrome.js?v=${BUILD}" defer></script>${extraScripts || ''}
</body>
</html>
`;
}

function indexHtml() {
  const slides = [
    { title: 'King Salman International Airport', sub: 'Redefining travel for Vision 2030 — six terminals, one seamless experience.', theme: 'vision' },
    { title: 'Six world-class terminals', sub: 'From Terminal 1 to Terminal 6 — designed for capacity, comfort, and connection.', theme: 'terminals' },
    { title: 'Your AIVC companion', sub: 'Airport Intelligent Virtual Companion — wallet, wayfinding, and disruption support.', theme: 'aivc' },
  ];
  const heroSlides = slides
    .map(
      (s, i) =>
        `<div class="ksia-hero-slide ksia-hero-theme-${s.theme}${i === 0 ? ' active' : ''}" role="img" aria-label="${s.title}"></div>`,
    )
    .join('\n        ');
  const heroText = slides
    .map(
      (s, i) =>
        `<div class="ksia-hero-text-slide${i === 0 ? ' active' : ''}"><h1 class="ksia-hero-h1">${s.title}</h1><p class="ksia-hero-sub">${s.sub}</p></div>`,
    )
    .join('\n          ');
  const indicators = slides.map((_, i) => `<button type="button" class="ksia-hero-ind${i === 0 ? ' ksia-hero-ind-active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('');

  const body = `    <section class="ksia-hero" aria-label="Featured">
      <div class="ksia-hero-slides">${heroSlides}</div>
      <div class="ksia-hero-overlay">
        <div class="ksia-hero-text-wrap">${heroText}</div>
        <div class="ksia-hero-controls">
          <button type="button" class="ksia-hero-ctrl" id="ksiaHeroPrev" aria-label="Previous slide">\u2039</button>
          <div class="ksia-hero-indicators">${indicators}</div>
          <button type="button" class="ksia-hero-ctrl" id="ksiaHeroNext" aria-label="Next slide">\u203A</button>
        </div>
      </div>
    </section>

    <section class="ksia-flight-search-wrap" aria-label="Flight search">
      <form id="ksiaFlightSearch" class="ksia-flight-search">
        <div class="ksia-search-field"><label for="ksiaOrigin">From</label><input id="ksiaOrigin" name="origin" placeholder="City or airport" autocomplete="off"></div>
        <div class="ksia-search-field"><label for="ksiaDestination">To</label><input id="ksiaDestination" name="destination" placeholder="City or airport" autocomplete="off"></div>
        <div class="ksia-search-field"><label for="ksiaTravelDate">Date</label><input id="ksiaTravelDate" name="date" type="date"></div>
        <button type="submit" class="ksia-btn ksia-btn-primary">Search flights</button>
      </form>
    </section>

    <section class="ksia-quick-links" aria-label="Quick links">
      <h2 class="ksia-section-title">Quick links</h2>
      <ul class="ksia-link-grid">
        <li><a href="flights/arrivals.html" class="ksia-card-link" data-ksia-quick-link>Flight arrivals</a></li>
        <li><a href="flights/departures.html" class="ksia-card-link" data-ksia-quick-link>Flight departures</a></li>
        <li><a href="at-the-airport/maps.html" class="ksia-card-link" data-ksia-quick-link>Terminal maps</a></li>
        <li><a href="transport/parking.html" class="ksia-card-link" data-ksia-quick-link>Parking</a></li>
        <li><a href="aivc/wallet-setup.html" class="ksia-card-link" data-ksia-quick-link>AIVC wallet</a></li>
        <li><a href="shop-dine/index.html" class="ksia-card-link" data-ksia-quick-link>Shop &amp; Dine</a></li>
      </ul>
    </section>`;

  return wrapPage({
    file: 'index.html',
    id: 'home',
    title: 'Home',
    bodyExtra: body,
    extraScripts: `\n  <script src="ksia-home.js?v=${BUILD}"></script>`,
  });
}

fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml());

for (const page of PAGES) {
  if (page.custom) continue;
  const dir = path.dirname(page.file);
  if (dir !== '.') fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, page.file), wrapPage(page));
}

console.log('Generated', PAGES.filter((p) => !p.custom).length + 1, 'KSIA pages in', ROOT);
if (PAGES.some((p) => p.custom)) {
  console.log('Skipped custom pages:', PAGES.filter((p) => p.custom).map((p) => p.file).join(', '));
}

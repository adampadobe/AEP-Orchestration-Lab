'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  inferBadge,
  parseAepPeriod,
  periodToId,
  periodToAjoPrefix,
  parseAepCdpProduct,
  parseAjoSectionProduct,
  parseMarkdownTableRows,
} = require('../releaseNotesMarkdownParser');

const aepSamplePath = path.join(__dirname, '..', '..', '.cursor', 'tmp', 'aep-release-notes-sample.md');

test('inferBadge detects beta and GA markers', () => {
  assert.equal(inferBadge('[!BADGE Beta] When to activate'), 'Beta');
  assert.equal(inferBadge('Google Ad Manager 360 now generally available'), 'GA');
  assert.equal(inferBadge('Fixed an issue with activation'), 'Fix');
});

test('parseAepPeriod reads June 2026 from frontmatter title', () => {
  const md = `---
title: Adobe Experience Platform Release Notes June 2026
---
# Adobe Experience Platform release notes
**Release date: June 16, 2026**
`;
  assert.equal(parseAepPeriod(md), 'June 2026');
  assert.equal(periodToId(parseAepPeriod(md)), 'june-2026');
  assert.equal(periodToAjoPrefix(parseAepPeriod(md)), 'june-26');
});

test('parseMarkdownTableRows extracts feature rows', () => {
  const section = `
| Feature | Description |
| --- | --- |
| [!BADGE Beta]{type=Informative} When to activate | Control which profile change types trigger exports. |
| Azure Private Link for Azure destinations | Route data exports over private IP addresses. |
`;
  const rows = parseMarkdownTableRows(section);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'When to activate');
  assert.equal(rows[0].badge, 'Beta');
  assert.match(rows[1].title, /Azure Private Link/i);
});

test('parseAepCdpProduct groups destinations and profile features', () => {
  const md = `
## Destinations {#destinations}
**New or updated destinations**
| Feature | Description |
| --- | --- |
| When to activate | Control which profile change types trigger exports. |
| Azure Private Link for Azure destinations | Route exports over private IPs. |

## Real-Time Customer Profile {#profile}
**New or updated features**
| Feature | Description |
| --- | --- |
| Batch profile ingestion | Batch profile ingestion now enforces format validation. |
`;
  const product = parseAepCdpProduct(md, 'https://example.test/aep');
  assert.equal(product.id, 'cdp');
  assert.ok(product.highlights.length >= 2);
  assert.equal(product.sections.length, 2);
  assert.match(product.sections[0].title, /Destinations/i);
});

test('parseAjoSectionProduct reads HTML table titles from journeys section', () => {
  const md = `
## June '26 release notes {#june-26-rn}
### Journeys {#june-26-journeys}
<table>
<thead>
<tr>
<th><strong>Journey Simulation (General Availability)</strong><br/></th>
</tr>
</thead>
<tbody>
<tr>
<td>
<p>You can now set your journey to Simulation.</p>
</td>
</tr>
</tbody>
</table>
`;
  const product = parseAjoSectionProduct(md, 'june-26', 'journeys', {
    id: 'ajoJ',
    name: 'Journey Optimizer — Journeys',
    shortName: 'AJO-J',
    releaseNotesUrl: 'https://example.test/ajo#journeys',
    sectionTitle: 'Journeys',
  });
  assert.equal(product.highlights.length, 1);
  assert.match(product.highlights[0].title, /Journey Simulation/i);
  assert.equal(product.highlights[0].badge, 'GA');
});

test('parseAepCdpProduct parses live Experience League markdown sample when present', { skip: !fs.existsSync(aepSamplePath) }, async () => {
  const md = fs.readFileSync(aepSamplePath, 'utf8');
  const product = parseAepCdpProduct(md, 'https://example.test/aep');
  assert.ok(product.highlights.some((item) => /When to activate/i.test(item.title)));
});

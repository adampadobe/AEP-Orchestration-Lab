import test from 'node:test';
import assert from 'node:assert/strict';
import { GIT_FORMAT, parseGitLog, parseSubject, pagesForFile, buildItems } from './build-whats-new.mjs';

const catalogue = { pages: [
  { route: '/profile-viewer/lloyds-loyalty.html', label: 'Lloyds – Loyalty' },
  { route: '/profile-viewer/lloyds.html', label: 'Lloyds' },
  { route: '/profile-viewer/consent.html', label: 'Consent' },
  { route: '/profile-viewer/brand-scraper.html', label: 'Brand scraper' },
] };
const index = catalogue.pages.map((p) => {
  const rel = p.route.slice('/profile-viewer/'.length);
  return { ...p, rel, dir: '', stem: rel.replace(/\.html$/, '') };
});

function log(commits) {
  return commits.map(({ sha = 'abc', at = '2026-10-05T10:00:00+00:00', subject, body = '', files = [] }) =>
    GIT_FORMAT.replace('%H', sha).replace('%cI', at).replace('%s', subject).replace('%b', body)
    + '\n' + files.map(([s, p]) => `${s}\t${p}`).join('\n') + '\n').join('');
}

test('subject parsing requires the [handle] subject (#NNN) convention', () => {
  assert.deepEqual(parseSubject('[kirkside-bit] Refresh Loyalty card (#465)'), { author: 'kirkside-bit', title: 'Refresh Loyalty card', prNumber: 465 });
  assert.equal(parseSubject('[adampadobe] Publish Coworker v2'), null);
  assert.equal(parseSubject('Merge branch main (#1)'), null);
});

test('files map to the longest matching page stem, directories and exact routes', () => {
  assert.deepEqual(pagesForFile('web/profile-viewer/lloyds-loyalty-runtime.js', index).map((p) => p.stem), ['lloyds-loyalty']);
  assert.deepEqual(pagesForFile('web/profile-viewer/lloyds.css', index).map((p) => p.stem), ['lloyds']);
  assert.deepEqual(pagesForFile('web/profile-viewer/brand-scraper/app.js', index).map((p) => p.stem), ['brand-scraper']);
  assert.deepEqual(pagesForFile('web/profile-viewer/aep-lab-nav.js', index), []);
  assert.deepEqual(pagesForFile('functions/consent.js', index), []);
});

test('items are new only when a nav page html was added; skip marker and non-PR commits are dropped', () => {
  const commits = parseGitLog(log([
    { sha: 'c4', subject: '[apalmer] Add consent page (#12)', files: [['A', 'web/profile-viewer/consent.html'], ['M', 'web/profile-viewer/consent.js']] },
    { sha: 'c3', subject: '[apalmer] Tidy (#11)', body: 'internal [skip-whats-new]', files: [['M', 'web/profile-viewer/consent.js']] },
    { sha: 'c2', subject: '[kirkside-bit] Loyalty fix (#10)', files: [['A', 'web/profile-viewer/lloyds-loyalty-extra.js'], ['R100', 'web/old.js\tweb/profile-viewer/lloyds.css']] },
    { sha: 'c1', subject: '[adampadobe] Direct push', files: [['A', 'web/profile-viewer/lloyds.html']] },
    { sha: 'c0', subject: '[apalmer] Backend only (#9)', files: [['M', 'functions/index.js']] },
  ]));
  const items = buildItems(commits, catalogue);
  assert.deepEqual(items.map((i) => [i.prNumber, i.kind]), [[12, 'new'], [10, 'updated'], [9, 'updated']]);
  assert.deepEqual(items[0], {
    title: 'Add consent page', prNumber: 12, mergedAt: '2026-10-05T10:00:00+00:00', author: 'apalmer',
    pages: [{ route: '/profile-viewer/consent.html', label: 'Consent' }], kind: 'new',
  });
  assert.deepEqual(items[1].pages.map((p) => p.label).sort(), ['Lloyds', 'Lloyds – Loyalty']);
  assert.deepEqual(items[2].pages, []);
  assert.equal(buildItems(commits, catalogue, { limit: 1 }).length, 1);
});

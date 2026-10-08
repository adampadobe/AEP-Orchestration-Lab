'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../demoStudioService');

const DOC = `<!DOCTYPE html><html><head><style>:root { --brand: #e00; --ink: #111; }</style>
<script>const s = "<section>not real</section>";</script></head><body>
<header class="top"><h1>Acme demo</h1></header>
<section id="one"><h2>Intro</h2><p>Welcome Acme</p></section>
<div class="slide"><h2>Offer</h2><p>Acme offer</p></div>
<div class="plain">ignored</div>
</body></html>`;

describe('demoStudio outline', () => {
  it('finds block sections and ignores markup inside scripts', () => {
    const outline = studio.buildOutline(DOC);
    assert.deepEqual(outline.map((s) => s.tag), ['header', 'section', 'div']);
    assert.match(outline[1].label, /Intro|one/);
    assert.ok(DOC.slice(outline[1].start, outline[1].end).startsWith('<section id="one">'));
    assert.ok(DOC.slice(outline[1].start, outline[1].end).endsWith('</section>'));
  });
});

describe('demoStudio applyOps', () => {
  it('applies section, text and style ops', () => {
    const { html, results, changed } = studio.applyOps(DOC, [
      { op: 'replaceSection', sectionId: 's2', html: '<section id="one"><h2>Hello Globex</h2></section>' },
      { op: 'replaceText', find: 'Acme offer', replace: 'Globex offer' },
      { op: 'setStyleVar', name: 'brand', value: '#0a0' },
      { op: 'note', text: 'Check the logo' },
    ]);
    assert.ok(changed);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    assert.match(html, /Hello Globex/);
    assert.doesNotMatch(html, /Welcome Acme/);
    assert.match(html, /Globex offer/);
    assert.match(html, /--brand: #0a0;/);
  });

  it('rejects ambiguous text unless all is set', () => {
    const amb = studio.applyOps(DOC, [{ op: 'replaceText', find: 'Acme', replace: 'Globex' }]);
    assert.equal(amb.results[0].ok, false);
    assert.match(amb.results[0].error, /ambiguous/);
    assert.equal(amb.changed, false);
    const all = studio.applyOps(DOC, [{ op: 'replaceText', find: 'Acme', replace: 'Globex', all: true }]);
    assert.equal(all.results[0].ok, true);
    assert.doesNotMatch(all.html, /Acme/);
  });

  it('rejects overlapping section rewrites and unknown sections', () => {
    const { results } = studio.applyOps(DOC, [
      { op: 'replaceSection', sectionId: 's2', html: '<section>a</section>' },
      { op: 'replaceSection', sectionId: 's2', html: '<section>b</section>' },
      { op: 'replaceSection', sectionId: 's99', html: '<section>c</section>' },
    ]);
    assert.deepEqual(results.map((r) => r.ok), [true, false, false]);
    assert.match(results[1].error, /Overlaps/);
    assert.match(results[2].error, /Unknown section/);
  });

  it('rejects unsafe or undeclared CSS variables', () => {
    const { results } = studio.applyOps(DOC, [
      { op: 'setStyleVar', name: '--brand', value: 'url(https://evil.example/x.png)' },
      { op: 'setStyleVar', name: '--brand', value: 'red; } body { display:none' },
      { op: 'setStyleVar', name: '--missing', value: 'red' },
    ]);
    assert.ok(results.every((r) => !r.ok));
  });

  it('drops unknown op types', () => {
    assert.deepEqual(studio.normaliseOps([{ op: 'eval', code: 'x' }, null, { op: 'note', text: 'ok' }]).map((o) => o.op), ['note']);
  });
});

describe('demoStudio validateEdit', () => {
  it('accepts a plain copy change', () => {
    assert.deepEqual(studio.validateEdit(DOC, DOC.replace('Intro', 'Introduction')), []);
  });

  it('blocks new external origins, base tags and removed closing tags', () => {
    const errs = studio.validateEdit(DOC, DOC
      .replace('<h1>', '<img src="https://evil.example/p.gif"><h1>')
      .replace('<head>', '<head><base href="/x/">')
      .replace('</body>', ''));
    assert.ok(errs.some((e) => /external origins/.test(e)));
    assert.ok(errs.some((e) => /<base>/.test(e)));
    assert.ok(errs.some((e) => /<\/body>/.test(e)));
  });

  it('blocks unbalanced script tags', () => {
    const errs = studio.validateEdit(DOC, DOC.replace('</body>', '<script>x()</body>'));
    assert.ok(errs.some((e) => /script/.test(e)));
  });
});

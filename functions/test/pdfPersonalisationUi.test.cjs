'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const css = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.css'),
  'utf8',
);
const html = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.html'),
  'utf8',
);
const script = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.js'),
  'utf8',
);

test('keeps delivery progress sticky through the open transactional containers', () => {
  assert.match(
    css,
    /\.pdf-test-progress-card\s*\{[^}]*position:\s*sticky;[^}]*max-height:\s*calc\(100vh\s*-\s*36px\);[^}]*overflow-y:\s*auto;/s,
  );
  assert.match(
    css,
    /#pdfStageReuse\[open\],\s*#pdfJourneyTestDetails\[open\]\s*\{\s*overflow:\s*visible;\s*\}/s,
  );
});

test('uses a compact sticky progress rail when the form becomes one column', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.pdf-test-progress-card\s*\{[^}]*position:\s*sticky;[^}]*order:\s*-1;/s,
  );
  assert.match(css, /\.pdf-test-progress\s*\{\s*grid-template-columns:\s*repeat\(4,/s);
});

test('presents story assistance as complete scenario generation', () => {
  assert.match(html, /invents a coherent fictional scenario for everything omitted/);
  assert.match(html, /generate every other passenger, booking, flight and check-in detail/);
  assert.match(script, /currentValues:\s*currentTestFieldValues\(\)/);
  assert.match(script, /Generating a complete scenario for every template field/);
});

test('lets publishers add, remove, and custom-map template fields', () => {
  assert.match(html, /id="pdfAddJourneyTemplateField"/);
  assert.match(html, /existing or new lowerCamelCase AJO/);
  assert.match(script, /createJourneyTemplateMappingRow/);
  assert.match(script, /pdf-template-mapping-remove/);
  assert.match(script, /fieldSelectionMode:\s*'editable'/);
  assert.match(script, /journeyMappingSourceValid/);
});

function testWorkspace(storage = new Map()) {
  class Element {
    constructor(tag = 'div') {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.listeners = {};
      this.textContent = '';
      this.hidden = false;
      this.checked = false;
      this._value = '';
    }
    get options() { return this.children; }
    get value() { return this._value; }
    set value(value) {
      this._value = this.tag === 'select' && !this.children.some((option) => option.value === String(value))
        ? '' : String(value);
    }
    replaceChildren(...children) { this.children = children; this._value = ''; }
    add(option) { this.children.push(option); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() {}
  }
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(id === 'pdfTestTemplate' ? 'select' : 'div'));
    return elements.get(id);
  };
  let sandbox = 'airline-demo';
  const warnings = [];
  const context = {
    URL, Intl, Date,
    console: { warn: (...args) => warnings.push(args) },
    Option: function (text, value) { return { text, value }; },
    window: {
      location: { href: 'https://lab.example/profile-viewer/pdf-personalisation.html' },
      AepGlobalSandbox: { getSandboxName: () => sandbox },
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      addEventListener() {},
    },
    document: {
      getElementById: element,
      querySelector: () => new Element(),
      createElement: (tag) => new Element(tag),
    },
  };
  vm.runInNewContext(script.replace('void init();', `window.testUi = {
    renderTestTemplateOptions, renderTestDynamicFields, bindJourneyTestSender,
    populateTestFieldsWithGemini, loadStoryAssistExample,
    setTemplates: (templates) => { journeyTemplatesAvailable = templates; },
    setUser: (uid) => { authUser = { uid }; },
  };`), context);
  const ui = context.window.testUi;
  ui.setUser('presenter');
  ui.bindJourneyTestSender();
  return {
    ui, element, warnings, storage, window: context.window,
    setSandbox: (value) => { sandbox = value; },
    choose: (name) => {
      element('pdfTestTemplate').value = name;
      element('pdfTestTemplate').listeners.change();
    },
  };
}

const airlineTemplates = [
  { templateName: 'riyadh-demo', source: 'uploaded', inputSchema: [] },
  { templateName: 'qatar-demo', source: 'uploaded', inputSchema: [] },
];

test('does not automatically select the first uploaded template', () => {
  const workspace = testWorkspace();
  workspace.ui.setTemplates(airlineTemplates);
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, '');
  assert.equal(workspace.element('pdfTestDocumentName').value, '');
  assert.match(workspace.element('pdfTestTemplateHint').textContent, /Choose a template/);
});

test('remembers an explicit Qatar template across reloads and library refreshes', () => {
  const workspace = testWorkspace();
  workspace.ui.setTemplates(airlineTemplates);
  workspace.ui.renderTestTemplateOptions();
  workspace.choose('qatar-demo');
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, 'qatar-demo');
  const reloaded = testWorkspace(workspace.storage);
  reloaded.ui.setTemplates(airlineTemplates);
  reloaded.ui.renderTestTemplateOptions();
  assert.equal(reloaded.element('pdfTestTemplate').value, 'qatar-demo');
  reloaded.choose('');
  reloaded.ui.renderTestTemplateOptions();
  assert.equal(reloaded.element('pdfTestTemplate').value, '');
  assert.equal(reloaded.storage.size, 0);
});

test('isolates choices by sandbox and account, and never substitutes a missing template', () => {
  const workspace = testWorkspace();
  workspace.ui.setTemplates(airlineTemplates);
  workspace.ui.renderTestTemplateOptions();
  workspace.choose('qatar-demo');
  workspace.setSandbox('another-sandbox');
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, '');
  workspace.choose('riyadh-demo');
  workspace.setSandbox('airline-demo');
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, 'qatar-demo');
  workspace.ui.setUser('another-presenter');
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, '');
  workspace.ui.setUser('presenter');
  workspace.ui.setTemplates([airlineTemplates[0]]);
  workspace.ui.renderTestTemplateOptions();
  assert.equal(workspace.element('pdfTestTemplate').value, '');
  assert.equal(workspace.element('pdfTestDocumentName').value, '');
});

test('reports storage failures without preventing explicit template selection', () => {
  const workspace = testWorkspace();
  workspace.window.localStorage.setItem = () => { throw new Error('Storage denied'); };
  workspace.ui.setTemplates(airlineTemplates);
  workspace.ui.renderTestTemplateOptions();
  workspace.choose('qatar-demo');
  assert.equal(workspace.element('pdfTestTemplate').value, 'qatar-demo');
  assert.match(workspace.element('pdfTestStoryStatus').textContent, /could not be remembered/);
  assert.equal(workspace.warnings.length, 1);
});

test('uses Doha for an empty FF_Image, preserves supplied images, and does not default an offer', () => {
  const workspace = testWorkspace();
  workspace.ui.setTemplates([{
    templateName: 'qatar-demo',
    inputSchema: [
      { name: 'FF_Image', dataType: 'image' },
      { name: 'Offer', dataType: 'image' },
      { name: 'Barcode', dataType: 'image' },
      { name: 'customHero', dataType: 'image' },
    ],
  }]);
  workspace.ui.renderTestTemplateOptions();
  workspace.choose('qatar-demo');
  const fields = () => workspace.element('pdfTestDynamicFields').children.map((wrapper) => wrapper.children[1]);
  assert.match(fields()[0].value, /\/doha-skyline\.png$/);
  assert.equal(fields()[1].value, '');
  assert.match(fields()[2].value, /\/riyadh-barcode\.png$/);
  assert.ok(fields()[0].options.every((option) => !/Offer|barcode/i.test(option.text)));
  assert.equal(fields()[3].value, '');
  assert.ok(fields()[3].options.some((option) => /Doha/.test(option.text)));
  workspace.ui.renderTestDynamicFields({ FF_Image: 'https://images.example/qatar.jpg' });
  assert.equal(fields()[0].value, 'https://images.example/qatar.jpg');
  assert.match(fields()[0].options.at(-1).text, /review before sending/);
});

test('retains the journey instructions and restores customer and route placeholders', () => {
  const workspace = testWorkspace();
  const example = html.match(/<textarea id="pdfTestStory"[^>]*>([^<]*)<\/textarea>/)[1];
  assert.match(example, /\[customer name\].*\[origin\].*\[destination\]/);
  assert.doesNotMatch(example, /Riyadh|Qatar|Dubai/i);
  const story = workspace.element('pdfTestStory');
  story.defaultValue = example;
  story.value = 'An edited journey';
  workspace.ui.loadStoryAssistExample();
  assert.equal(story.value, example);
  assert.match(story.value, /Keep the recipient email already entered and generate every other passenger, booking, flight and check-in detail\./);
});

test('rejects unfilled journey placeholders before calling the generation API', async () => {
  const workspace = testWorkspace();
  workspace.ui.setTemplates(airlineTemplates);
  workspace.ui.renderTestTemplateOptions();
  workspace.choose('qatar-demo');
  workspace.element('pdfTestStory').value = 'Create a [customer name] flight from [origin] to [destination].';
  await workspace.ui.populateTestFieldsWithGemini();
  assert.match(workspace.element('pdfTestStoryStatus').textContent, /Replace \[customer name\]/);
  assert.equal(workspace.element('pdfTestStoryGenerate').disabled, false);
});

test('API-guide examples are unbranded and reference a built-in template', () => {
  for (const id of ['pdfActionRequest', 'pdfActionSuccess']) {
    const payload = JSON.parse(html.match(new RegExp(`<pre id="${id}">([\\s\\S]*?)</pre>`))[1]);
    assert.equal(payload.templateName, 'checkin-confirmation');
    assert.match(payload.requestId, /^airline-checkin-/);
    assert.doesNotMatch(JSON.stringify(payload), /Riyadh|riyadh|Dubai|RX 123/);
  }
});

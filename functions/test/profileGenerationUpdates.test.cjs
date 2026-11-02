'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const webDir = resolve(__dirname, '../../web/profile-viewer');
const runtimeSource = readFileSync(resolve(webDir, 'profile-generation-industry-runtime.js'), 'utf8');
const fsiSource = readFileSync(resolve(webDir, 'profile-generation-fsi.js'), 'utf8');

function runtimeHelpers() {
  const window = {};
  runInNewContext(runtimeSource, { window });
  return window.AepProfileGenIndustry.helpers;
}

function fsiHooks(elements) {
  let config;
  const window = {
    AepProfileGenIndustry: {
      bind(value) {
        config = value;
      },
    },
  };
  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
  };
  runInNewContext(fsiSource, { window, document });
  assert.ok(config, 'FSI module registers its industry configuration');
  return config.industry;
}

test('industry builder failure prevents update submission and returns a reportable error', async () => {
  let submitCount = 0;
  const failure = new Error('test builder failure');
  const result = await runtimeHelpers().buildAndSubmitUpdates(
    () => {
      throw failure;
    },
    async () => {
      submitCount += 1;
    },
  );

  assert.equal(result.phase, 'build');
  assert.equal(result.error, failure);
  assert.equal(submitCount, 0);
});

test('actual form builder propagates an industry hook failure instead of submitting shared fields', async () => {
  const start = runtimeSource.indexOf('function buildUpdatesFromForm(');
  const end = runtimeSource.indexOf('\n    function ', start + 1);
  assert.ok(start >= 0 && end > start);
  const source = runtimeSource.slice(start, end);
  const failure = new Error('industry hook failed');
  const context = {
    trimVal: () => '',
    industryHooks: { buildUpdates() { throw failure; } },
  };
  for (const name of source.matchAll(/\b([A-Za-z]+El)\b/g)) context[name[1]] = null;
  const build = runInNewContext(`(${source.trim()})`, context);
  let submissions = 0;
  const result = await runtimeHelpers().buildAndSubmitUpdates(
    () => build('test@example.com'),
    async () => { submissions++; },
  );
  assert.equal(result.error, failure);
  assert.equal(result.phase, 'build');
  assert.equal(submissions, 0);
});

test('FSI tax filing builder writes true and false for each filing status', () => {
  const elements = {
    fsiTaxFilingJoint: { checked: true, addEventListener() {} },
    fsiTaxFilingSeparate: { checked: false, addEventListener() {} },
    fsiTaxFilingSingle: { checked: false, addEventListener() {} },
  };
  const updates = [];
  fsiHooks(elements).buildUpdates({
    push(path, value) {
      updates.push({ path, value });
    },
  });

  assert.deepEqual(
    updates.filter(({ path }) => path.startsWith('personalFinances.personalTaxProfile.') &&
      ['filingJointly', 'filingSeparately', 'singleFiler'].some((field) => path.endsWith(`.${field}`))),
    [
      { path: 'personalFinances.personalTaxProfile.filingJointly', value: true },
      { path: 'personalFinances.personalTaxProfile.filingSeparately', value: false },
      { path: 'personalFinances.personalTaxProfile.singleFiler', value: false },
    ],
  );
});

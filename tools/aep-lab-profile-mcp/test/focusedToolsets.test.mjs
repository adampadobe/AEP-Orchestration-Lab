import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerConfirmProfileGenerationTool,
  registerGenerationPrefsTools,
} from '../src/tools/generationPrefs.mjs';

function registrationRecorder() {
  const names = [];
  return {
    names,
    server: {
      registerTool(name) {
        names.push(name);
      },
    },
  };
}

test('full generation preferences registration remains backward compatible', () => {
  const { names, server } = registrationRecorder();
  registerGenerationPrefsTools(server);
  assert.deepEqual(names, [
    'lab_get_generation_prefs',
    'lab_set_generation_prefs',
    'lab_confirm_generation_plan',
    'lab_confirm_profile_generation',
  ]);
});

test('focused profile registration can expose only the confirmation gate', () => {
  const { names, server } = registrationRecorder();
  registerConfirmProfileGenerationTool(server);
  assert.deepEqual(names, ['lab_confirm_profile_generation']);
});

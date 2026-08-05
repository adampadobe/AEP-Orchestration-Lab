import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerConfirmProfileGenerationTool,
  registerGenerationPrefsTools,
} from '../src/tools/generationPrefs.mjs';
import { registerFocusedProfileTools } from '../src/tools/index.mjs';

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

test('focused profile endpoint exposes the complete governed profile lifecycle', () => {
  const { names, server } = registrationRecorder();
  registerFocusedProfileTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'lab_list_industries',
    'lab_profile_infra_status',
    'lab_preflight_profile_generate',
    'lab_confirm_profile_generation',
    'lab_generate_profile',
    'lab_lookup_profile',
    'lab_get_profile',
    'lab_update_profile',
    'lab_profile_activity',
    'lab_list_event_targets',
    'lab_preflight_profile_event',
    'lab_send_profile_event',
    'lab_send_profile_events_batch',
    'lab_send_retail_journey_events',
    'lab_snowflake_config',
    'lab_snowflake_test_connection',
    'lab_snowflake_get_profile_by_email',
    'lab_snowflake_enrich_profiles',
    'lab_snowflake_get_profile_bundle',
  ]);
});

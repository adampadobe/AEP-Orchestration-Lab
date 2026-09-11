import assert from 'node:assert/strict';
import test from 'node:test';
import { registerMeasurementQualityTools } from '../src/tools/measurementQualityTools.mjs';

test('registers the five read-only measurement quality tools', () => {
  const names = [];
  registerMeasurementQualityTools({ registerTool(name) { names.push(name); } });
  assert.deepEqual(names, [
    'assurance_session_list',
    'assurance_event_inspect',
    'launch_property_audit',
    'launch_environment_list',
    'status_incident_correlate',
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { annotationsForTool, installToolAnnotations } from '../src/toolAnnotations.mjs';

test('classifies read-only and destructive audience tools', () => {
  assert.deepEqual(annotationsForTool('lab_audience_list'), {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(annotationsForTool('lab_audience_delete'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
  assert.deepEqual(annotationsForTool('lab_ajo_journey_list'), {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(annotationsForTool('lab_ajo_campaign_delete'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});

test('annotates every registration while preserving explicit overrides', () => {
  const registrations = [];
  const server = {
    registerTool(name, definition, handler) {
      registrations.push({ name, definition, handler });
    },
  };
  installToolAnnotations(server);
  const handler = () => {};
  server.registerTool('lab_audience_delete', {
    description: 'delete',
    annotations: { idempotentHint: true },
  }, handler);

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].handler, handler);
  assert.deepEqual(registrations[0].definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });
});

test('classifies PDF inspection, generation, and archive operations', () => {
  assert.equal(annotationsForTool('lab_pdf_job_list').readOnlyHint, true);
  assert.deepEqual(annotationsForTool('lab_pdf_generate'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(annotationsForTool('lab_pdf_server_template_archive'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});

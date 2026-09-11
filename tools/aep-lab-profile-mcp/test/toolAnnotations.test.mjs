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

test('classifies image auto-classification as a retry-safe non-destructive write', () => {
  assert.deepEqual(annotationsForTool('lab_brand_scrape_classify_images'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
});

test('classifies Firefly preview/status as reads and generation/cancel as non-idempotent writes', () => {
  assert.equal(annotationsForTool('lab_firefly_capabilities').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_generate_preview').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_generate_video_preview').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_audio_voice_list').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_audio_speech_preview').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_audio_transcribe_preview').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_audio_dub_preview').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_job_status').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_firefly_generate_apply').idempotentHint, false);
  assert.equal(annotationsForTool('lab_firefly_generate_video_apply').idempotentHint, false);
  assert.equal(annotationsForTool('lab_firefly_audio_speech_apply').idempotentHint, false);
  assert.equal(annotationsForTool('lab_firefly_job_cancel').destructiveHint, true);
});

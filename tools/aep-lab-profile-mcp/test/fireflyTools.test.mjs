import assert from 'node:assert/strict';
import test from 'node:test';

import { registerFireflyTools } from '../src/tools/fireflyTools.mjs';

function recorder(client) {
  const tools = new Map();
  registerFireflyTools({
    registerTool(name, definition, handler) { tools.set(name, { definition, handler }); },
  }, { client });
  return tools;
}

function body(result) {
  return JSON.parse(result.content[0].text);
}

test('registers the focused Firefly generation lifecycle', () => {
  const tools = recorder({});
  assert.deepEqual([...tools.keys()], [
    'lab_firefly_capabilities',
    'lab_firefly_generate_preview',
    'lab_firefly_generate_apply',
    'lab_firefly_generate_video_preview',
    'lab_firefly_generate_video_apply',
    'lab_firefly_job_status',
    'lab_firefly_job_cancel',
  ]);
});

test('video preview is deterministic and apply submits one unchanged request', async () => {
  const submissions = [];
  const tools = recorder({
    submitVideoGenerate: async (request) => {
      submissions.push(request);
      return { job_id: 'video-1', status_url: 'https://firefly-api.adobe.io/v3/status/video-1' };
    },
  });
  const request = {
    prompt: 'A slow cinematic pan across a desert resort',
    size: '1920x1080',
    camera_motion: 'camera pan right',
    prompt_style: 'cinematic',
  };
  const preview = body(await tools.get('lab_firefly_generate_video_preview').handler(request));
  assert.equal(preview.ok, true);
  assert.equal(preview.billable, false);
  assert.equal(preview.duration_seconds, 5);
  assert.match(preview.confirmation, /^GENERATE FIREFLY VIDEO /);

  const rejected = await tools.get('lab_firefly_generate_video_apply').handler({
    ...request,
    preflight_id: preview.preflight_id,
    confirmation: 'yes',
  });
  assert.equal(rejected.isError, true);
  assert.equal(submissions.length, 0);

  const accepted = body(await tools.get('lab_firefly_generate_video_apply').handler({
    ...request,
    preflight_id: preview.preflight_id,
    confirmation: preview.confirmation,
  }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.job.job_id, 'video-1');
  assert.deepEqual(submissions, [{
    prompt: request.prompt,
    size: request.size,
    bit_rate_factor: 18,
    camera_motion: request.camera_motion,
    prompt_style: request.prompt_style,
  }]);
});
test('preview is deterministic and apply requires the unchanged request and exact confirmation', async () => {
  const submissions = [];
  const tools = recorder({
    capabilities: () => ({ configured: true }),
    submitGenerate: async (request) => {
      submissions.push(request);
      return { job_id: 'job-1', status_url: 'https://firefly-api.adobe.io/v4/status/job-1' };
    },
  });
  const request = { prompt: 'A premium desert resort', aspect_ratio: '16:9' };
  const preview = body(await tools.get('lab_firefly_generate_preview').handler(request));

  assert.equal(preview.ok, true);
  assert.equal(preview.preflight_id.length, 64);
  assert.match(preview.confirmation, /^GENERATE FIREFLY IMAGE /);

  const rejected = await tools.get('lab_firefly_generate_apply').handler({
    ...request,
    preflight_id: preview.preflight_id,
    confirmation: 'yes',
  });
  assert.equal(rejected.isError, true);
  assert.equal(submissions.length, 0);

  const accepted = body(await tools.get('lab_firefly_generate_apply').handler({
    ...request,
    preflight_id: preview.preflight_id,
    confirmation: preview.confirmation,
  }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.job.job_id, 'job-1');
  assert.equal(submissions.length, 1);
});

test('status returns a cancel phrase and cancellation requires it exactly', async () => {
  let cancelled = false;
  const tools = recorder({
    getJobStatus: async () => ({ job_id: 'job-9', status: 'running', output_urls: [] }),
    cancelJob: async () => { cancelled = true; },
  });
  const statusUrl = 'https://firefly-api.adobe.io/v4/status/job-9';
  const status = body(await tools.get('lab_firefly_job_status').handler({ status_url: statusUrl }));
  assert.equal(status.cancel_confirmation, 'CANCEL FIREFLY JOB job-9');

  const bad = await tools.get('lab_firefly_job_cancel').handler({
    cancel_url: 'https://firefly-api.adobe.io/v4/cancel/job-9',
    confirmation: 'cancel',
  });
  assert.equal(bad.isError, true);
  assert.equal(cancelled, false);

  const ok = body(await tools.get('lab_firefly_job_cancel').handler({
    cancel_url: 'https://firefly-api.adobe.io/v4/cancel/job-9',
    confirmation: status.cancel_confirmation,
  }));
  assert.equal(ok.ok, true);
  assert.equal(cancelled, true);
});

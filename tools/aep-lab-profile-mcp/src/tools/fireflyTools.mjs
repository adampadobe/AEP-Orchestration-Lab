import { createHash } from 'node:crypto';
import * as z from 'zod';

import { writeAuditLog } from '../auditLog.mjs';
import { createFireflyApiClient } from '../fireflyApiClient.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const ASPECT_RATIOS = ['auto', '1:1', '4:3', '3:4', '16:9', '9:16'];
const VIDEO_SIZES = ['1920x1080', '1280x720', '960x540', '1080x1920', '720x1280', '540x960', '1080x1080', '720x720', '540x540'];
const CAMERA_MOTIONS = ['camera pan left', 'camera pan right', 'camera zoom in', 'camera zoom out', 'camera tilt up', 'camera tilt down', 'camera locked down', 'camera handheld'];
const PROMPT_STYLES = ['anime', '3d', 'fantasy', 'cinematic', 'claymation', 'line art', 'stop motion', '2d', 'vector art', 'black and white'];
const SHOT_ANGLES = ['aerial shot', 'eye_level shot', 'high angle shot', 'low angle shot', 'top-down shot'];
const SHOT_SIZES = ['close-up shot', 'extreme close-up', 'medium shot', 'long shot', 'extreme long shot'];
const KEYFRAME_HOSTS = ['amazonaws.com', 'windows.net', 'dropboxusercontent.com', 'storage.googleapis.com'];
const trustedMediaUrlSchema = z.string().url().max(2083).refine((rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && KEYFRAME_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}, 'Media URL must use HTTPS on an Adobe-supported storage domain');
const generateSchema = {
  prompt: z.string().trim().min(1).max(1024).describe('The image prompt. Do not include credentials or personal data.'),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe('Output aspect ratio; default auto.'),
};
const videoGenerateSchema = {
  prompt: z.string().trim().min(1).max(1024).describe('Prompt for one five-second video. Do not include credentials or personal data.'),
  size: z.enum(VIDEO_SIZES).optional().describe('Output dimensions; default 1920x1080.'),
  bit_rate_factor: z.number().int().min(0).max(63).optional().describe('Encoding constant-rate factor; default 18. Adobe suggests 17-23.'),
  seed: z.number().int().min(0).max(4294967295).optional().describe('Optional single deterministic seed.'),
  camera_motion: z.enum(CAMERA_MOTIONS).optional(),
  prompt_style: z.enum(PROMPT_STYLES).optional(),
  shot_angle: z.enum(SHOT_ANGLES).optional(),
  shot_size: z.enum(SHOT_SIZES).optional(),
  start_frame_url: trustedMediaUrlSchema.optional().describe('Optional HTTPS pre-signed first-frame URL on an Adobe-supported storage domain.'),
  end_frame_url: trustedMediaUrlSchema.optional().describe('Optional HTTPS pre-signed final-frame URL on an Adobe-supported storage domain.'),
};
const localeSchema = z.string().regex(/^[a-z]{2,3}-(?:[A-Z]{2}|\d{3})$/).describe('BCP-47 locale such as en-US or es-419');
const speechSchema = {
  text: z.string().trim().min(1).max(20000).describe('Plain-text script. Do not include credentials or sensitive personal data.'),
  voice_id: z.string().trim().min(1).max(200),
  locale_code: localeSchema.optional().describe('Default en-US'),
  output_media_type: z.literal('audio/wav').optional(),
};
const mediaSchema = {
  media_kind: z.enum(['audio', 'video']),
  source_url: trustedMediaUrlSchema.describe('Pre-signed input media URL on supported cloud storage'),
  media_type: z.enum(['audio/mp3', 'audio/wav', 'audio/aac', 'video/mp4', 'video/quicktime']),
};
const transcribeSchema = {
  ...mediaSchema,
  target_locale_codes: z.array(localeSchema).min(1).max(5).optional(),
  captions_format: z.literal('srt').optional(),
};
const dubSchema = {
  ...mediaSchema,
  target_locale_codes: z.array(localeSchema).min(1).max(5),
  lip_sync: z.boolean().optional().describe('Video only; default false'),
};

function canonicalRequest({ prompt, aspect_ratio = 'auto' }) {
  return { prompt: String(prompt).trim(), aspect_ratio };
}
function preflight(request) {
  const canonical = canonicalRequest(request);
  const preflightId = createHash('sha256')
    .update(JSON.stringify({ version: 1, operation: 'firefly_image5_generate', ...canonical }))
    .digest('hex');
  return {
    request: canonical,
    preflight_id: preflightId,
    confirmation: `GENERATE FIREFLY IMAGE ${preflightId.slice(0, 12).toUpperCase()}`,
  };
}

function canonicalVideoRequest({
  prompt,
  size = '1920x1080',
  bit_rate_factor = 18,
  seed,
  camera_motion,
  prompt_style,
  shot_angle,
  shot_size,
  start_frame_url,
  end_frame_url,
}) {
  return {
    prompt: String(prompt).trim(),
    size,
    bit_rate_factor,
    ...(seed === undefined ? {} : { seed }),
    ...(camera_motion ? { camera_motion } : {}),
    ...(prompt_style ? { prompt_style } : {}),
    ...(shot_angle ? { shot_angle } : {}),
    ...(shot_size ? { shot_size } : {}),
    ...(start_frame_url ? { start_frame_url } : {}),
    ...(end_frame_url ? { end_frame_url } : {}),
  };
}

function videoPreflight(request) {
  const canonical = canonicalVideoRequest(request);
  const preflightId = createHash('sha256')
    .update(JSON.stringify({ version: 1, operation: 'firefly_video1_generate', ...canonical }))
    .digest('hex');
  return {
    request: canonical,
    preflight_id: preflightId,
    confirmation: `GENERATE FIREFLY VIDEO ${preflightId.slice(0, 12).toUpperCase()}`,
  };
}

function validateMediaKind(request) {
  if (!String(request.media_type).startsWith(`${request.media_kind}/`)) {
    throw new Error(`media_type must match media_kind ${request.media_kind}`);
  }
  if (request.lip_sync && request.media_kind !== 'video') throw new Error('lip_sync is supported only for video input');
}

function governedPreflight(operation, phrase, request) {
  const canonical = Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined));
  const preflightId = createHash('sha256')
    .update(JSON.stringify({ version: 1, operation, ...canonical }))
    .digest('hex');
  return {
    request: canonical,
    preflight_id: preflightId,
    confirmation: `${phrase} ${preflightId.slice(0, 12).toUpperCase()}`,
  };
}

function jobIdFromUrl(rawUrl) {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).at(-1) || 'unknown');
  } catch {
    return 'unknown';
  }
}

function fireflyError(error) {
  return toolError(error?.message || 'Adobe Firefly request failed');
}

/** Register governed Firefly image, video, speech, transcription, and dubbing workflows. */
export function registerFireflyTools(mcpServer, { client = createFireflyApiClient() } = {}) {
  mcpServer.registerTool('lab_firefly_capabilities', {
    title: 'Inspect Adobe Firefly capabilities',
    description: 'Shows enabled Firefly image, video, speech, transcription, and dubbing operations plus server readiness without exposing credentials.',
    inputSchema: {},
  }, async () => jsonResult({ ok: true, firefly: client.capabilities() }));

  mcpServer.registerTool('lab_firefly_generate_preview', {
    title: 'Preview a Firefly Image 5 generation',
    description: 'Validates one text-to-image request without consuming Firefly credits. Returns a SHA-256 preflight ID and exact confirmation phrase.',
    inputSchema: generateSchema,
  }, async (params) => jsonResult({ ok: true, operation: 'firefly_image5_generate', ...preflight(params), billable: false }));

  mcpServer.registerTool('lab_firefly_generate_apply', {
    title: 'Submit a previewed Firefly Image 5 generation',
    description: 'Submits exactly one unchanged previewed request. This is billable and non-idempotent, is never retried automatically, and requires the preflight ID plus exact confirmation.',
    inputSchema: {
      ...generateSchema,
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => {
    const expected = preflight(params);
    if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) {
      return toolError('Firefly generation confirmation did not match the unchanged preview', {
        expected_preflight_id: expected.preflight_id,
        expected_confirmation: expected.confirmation,
      });
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_generate_apply', preflightId: expected.preflight_id });
    try {
      const job = await client.submitGenerate(expected.request);
      return jsonResult({
        ok: true,
        submitted: true,
        billable: true,
        job,
        next_step: 'Call lab_firefly_job_status with job.status_url until the status is succeeded or failed.',
      });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_generate_video_preview', {
    title: 'Preview a Firefly Video generation',
    description: 'Validates and hash-binds one five-second text-to-video or keyframe-guided request without consuming Firefly credits. Returns the exact confirmation phrase required for submission.',
    inputSchema: videoGenerateSchema,
  }, async (params) => jsonResult({
    ok: true,
    operation: 'firefly_video1_generate',
    ...videoPreflight(params),
    billable: false,
    duration_seconds: 5,
  }));

  mcpServer.registerTool('lab_firefly_generate_video_apply', {
    title: 'Submit a previewed Firefly Video generation',
    description: 'Submits exactly one unchanged five-second video request. This is billable and non-idempotent, is never retried automatically, and requires the preflight ID plus exact confirmation.',
    inputSchema: {
      ...videoGenerateSchema,
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => {
    const expected = videoPreflight(params);
    if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) {
      return toolError('Firefly video generation confirmation did not match the unchanged preview', {
        expected_preflight_id: expected.preflight_id,
        expected_confirmation: expected.confirmation,
      });
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_generate_video_apply', preflightId: expected.preflight_id });
    try {
      const job = await client.submitVideoGenerate(expected.request);
      return jsonResult({
        ok: true,
        submitted: true,
        billable: true,
        duration_seconds: 5,
        job,
        next_step: 'Call lab_firefly_job_status with job.status_url until the status is succeeded or failed.',
      });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_voice_list', {
    title: 'List Firefly speech voices',
    description: 'Reads the bounded Adobe Firefly stock voice catalog for selecting a voice ID. No generation or credits are consumed.',
    inputSchema: {},
  }, async () => {
    try { return jsonResult({ ok: true, voices: await client.listAudioVoices() }); }
    catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_speech_preview', {
    title: 'Preview Firefly text to speech',
    description: 'Validates and hash-binds a Text to Speech request without submitting it or consuming credits.',
    inputSchema: speechSchema,
  }, async (params) => jsonResult({
    ok: true,
    operation: 'firefly_audio_generate_speech',
    ...governedPreflight('firefly_audio_generate_speech', 'GENERATE FIREFLY SPEECH', {
      text: String(params.text).trim(), voice_id: params.voice_id,
      locale_code: params.locale_code || 'en-US', output_media_type: params.output_media_type || 'audio/wav',
    }),
    billable: false,
  }));

  mcpServer.registerTool('lab_firefly_audio_speech_apply', {
    title: 'Submit previewed Firefly text to speech',
    description: 'Submits one unchanged billable Text to Speech request without automatic retry. Requires the preview ID and exact confirmation.',
    inputSchema: { ...speechSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const expected = governedPreflight('firefly_audio_generate_speech', 'GENERATE FIREFLY SPEECH', {
      text: String(params.text).trim(), voice_id: params.voice_id,
      locale_code: params.locale_code || 'en-US', output_media_type: params.output_media_type || 'audio/wav',
    });
    if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) {
      return toolError('Firefly speech confirmation did not match the unchanged preview', { expected_preflight_id: expected.preflight_id, expected_confirmation: expected.confirmation });
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_audio_speech_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, billable: true, job: await client.submitSpeech(expected.request), next_step: 'Call lab_firefly_job_status with job.status_url.' }); }
    catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_transcribe_preview', {
    title: 'Preview Firefly transcription',
    description: 'Validates and hash-binds one audio/video transcription, optional translation, and SRT captions request without submitting it.',
    inputSchema: transcribeSchema,
  }, async (params) => {
    try {
      validateMediaKind(params);
      return jsonResult({ ok: true, operation: 'firefly_audio_transcribe', ...governedPreflight('firefly_audio_transcribe', 'TRANSCRIBE FIREFLY MEDIA', params), billable: false });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_transcribe_apply', {
    title: 'Submit previewed Firefly transcription',
    description: 'Submits one unchanged billable transcription request without automatic retry. Requires the preview ID and exact confirmation.',
    inputSchema: { ...transcribeSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    try {
      validateMediaKind(params);
      const request = Object.fromEntries(Object.entries(params).filter(([key, value]) => !['preflight_id', 'confirmation'].includes(key) && value !== undefined));
      const expected = governedPreflight('firefly_audio_transcribe', 'TRANSCRIBE FIREFLY MEDIA', request);
      if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) return toolError('Firefly transcription confirmation did not match the unchanged preview', { expected_preflight_id: expected.preflight_id, expected_confirmation: expected.confirmation });
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_audio_transcribe_apply', preflightId: expected.preflight_id });
      return jsonResult({ ok: true, submitted: true, billable: true, job: await client.submitTranscribe(expected.request), next_step: 'Call lab_firefly_job_status with job.status_url.' });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_dub_preview', {
    title: 'Preview Firefly dubbing',
    description: 'Validates and hash-binds one audio/video dubbing request with optional video lip sync without submitting it.',
    inputSchema: dubSchema,
  }, async (params) => {
    try {
      validateMediaKind(params);
      return jsonResult({ ok: true, operation: 'firefly_audio_dub', ...governedPreflight('firefly_audio_dub', 'DUB FIREFLY MEDIA', { ...params, lip_sync: params.lip_sync || false }), billable: false });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_audio_dub_apply', {
    title: 'Submit previewed Firefly dubbing',
    description: 'Submits one unchanged billable dub without automatic retry. Requires the preview ID and exact confirmation.',
    inputSchema: { ...dubSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    try {
      validateMediaKind(params);
      const request = Object.fromEntries(Object.entries({ ...params, lip_sync: params.lip_sync || false }).filter(([key, value]) => !['preflight_id', 'confirmation'].includes(key) && value !== undefined));
      const expected = governedPreflight('firefly_audio_dub', 'DUB FIREFLY MEDIA', request);
      if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) return toolError('Firefly dubbing confirmation did not match the unchanged preview', { expected_preflight_id: expected.preflight_id, expected_confirmation: expected.confirmation });
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_audio_dub_apply', preflightId: expected.preflight_id });
      return jsonResult({ ok: true, submitted: true, billable: true, job: await client.submitDub(expected.request), next_step: 'Call lab_firefly_job_status with job.status_url.' });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_job_status', {
    title: 'Check a Firefly job',
    description: 'Checks one Adobe-provided Firefly image, video, speech, transcription, or dubbing status URL and returns current status and output URLs.',
    inputSchema: { status_url: z.string().url().max(2048) },
  }, async ({ status_url }) => {
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_job_status' });
    try {
      const job = await client.getJobStatus(status_url);
      return jsonResult({
        ok: true,
        job,
        ...(status_url.startsWith('https://firefly-api.adobe.io/') ? { cancel_confirmation: `CANCEL FIREFLY JOB ${job.job_id}` } : {}),
      });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_job_cancel', {
    title: 'Cancel a Firefly generation job',
    description: 'Cancels one submitted Firefly job through its Adobe-provided cancel URL. Requires exact confirmation: CANCEL FIREFLY JOB <job-id>.',
    inputSchema: {
      cancel_url: z.string().url().max(2048),
      confirmation: z.string().min(1).max(500),
    },
  }, async ({ cancel_url, confirmation }) => {
    const jobId = jobIdFromUrl(cancel_url);
    const expected = `CANCEL FIREFLY JOB ${jobId}`;
    if (confirmation !== expected) return toolError('Firefly cancellation confirmation did not match', { expected_confirmation: expected });
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_job_cancel', jobId });
    try {
      const result = await client.cancelJob(cancel_url);
      return jsonResult({ ok: true, ...result });
    } catch (error) { return fireflyError(error); }
  });
}

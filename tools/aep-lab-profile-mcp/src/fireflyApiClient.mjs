/** Server-side Adobe Firefly Image API client. Credentials never leave Cloud Run. */

const DEFAULT_IMS_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_API_BASE = 'https://firefly-api.adobe.io';
const AUDIO_VIDEO_API_BASE = 'https://audio-video-api.adobe.io';
const TOKEN_EXPIRY_BUFFER_MS = 30_000;
const VIDEO_MODEL_VERSION = 'video1_standard';
const VIDEO_SIZES = Object.freeze({
  '1920x1080': Object.freeze({ width: 1920, height: 1080 }),
  '1280x720': Object.freeze({ width: 1280, height: 720 }),
  '960x540': Object.freeze({ width: 960, height: 540 }),
  '1080x1920': Object.freeze({ width: 1080, height: 1920 }),
  '720x1280': Object.freeze({ width: 720, height: 1280 }),
  '540x960': Object.freeze({ width: 540, height: 960 }),
  '1080x1080': Object.freeze({ width: 1080, height: 1080 }),
  '720x720': Object.freeze({ width: 720, height: 720 }),
  '540x540': Object.freeze({ width: 540, height: 540 }),
});
const KEYFRAME_HOSTS = Object.freeze([
  'amazonaws.com',
  'windows.net',
  'dropboxusercontent.com',
  'storage.googleapis.com',
]);

export class FireflyApiError extends Error {}

function loadConfig(env) {
  const clientId = String(env.FIREFLY_CLIENT_ID || '').trim();
  const clientSecret = String(env.FIREFLY_CLIENT_SECRET || '').trim();
  const scopes = String(env.FIREFLY_SCOPES || '').trim();
  if (!clientId || !clientSecret || !scopes) {
    throw new FireflyApiError('Adobe Firefly server credentials are not configured');
  }
  return {
    clientId,
    clientSecret,
    scopes,
    imsUrl: String(env.FIREFLY_IMS_URL || DEFAULT_IMS_URL).replace(/\/$/, ''),
    apiBase: String(env.FIREFLY_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
  };
}

function validateAdobeJobUrl(rawUrl, { cancel = false } = {}) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new FireflyApiError('invalid Adobe job URL'); }
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = cancel ? ['firefly-api.adobe.io'] : ['firefly-api.adobe.io', 'audio-video-api.adobe.io'];
  if (parsed.protocol !== 'https:' || !allowedHosts.includes(host)) {
    throw new FireflyApiError('untrusted Adobe job URL');
  }
  return parsed.toString();
}

function validateMediaUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new FireflyApiError('invalid Firefly media URL'); }
  const host = parsed.hostname.toLowerCase();
  const allowed = KEYFRAME_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (parsed.protocol !== 'https:' || !allowed) {
    throw new FireflyApiError('Firefly media URL must use HTTPS on an Adobe-supported storage domain');
  }
  return parsed.toString();
}

function validateKeyframeUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new FireflyApiError('invalid Firefly video keyframe URL'); }
  const host = parsed.hostname.toLowerCase();
  const allowed = KEYFRAME_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (parsed.protocol !== 'https:' || !allowed) {
    throw new FireflyApiError('Firefly video keyframe URL must use HTTPS on an Adobe-supported storage domain');
  }
  return parsed.toString();
}

function jobIdFrom(data, statusUrl) {
  const explicit = data?.jobId || data?.id;
  if (typeof explicit === 'string' && explicit) return explicit;
  const segment = new URL(statusUrl).pathname.split('/').filter(Boolean).at(-1);
  if (!segment) throw new FireflyApiError('Adobe operation response did not contain a job identifier');
  return decodeURIComponent(segment);
}

function linkHref(data, relation) {
  const value = data?.links?.[relation]?.href;
  return typeof value === 'string' ? value : undefined;
}

function collectHttpsUrls(value, urls) {
  if (typeof value === 'string') {
    if (value.startsWith('https://') && !urls.includes(value)) urls.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const nested of value) collectHttpsUrls(nested, urls);
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectHttpsUrls(nested, urls);
  }
}

function extractOutputUrls(payload) {
  const result = payload?.result ?? payload;
  const containers = [];
  if (result && typeof result === 'object') {
    for (const key of ['outputs', 'images', 'data']) {
      if (Array.isArray(result[key])) containers.push(...result[key]);
    }
  }
  const urls = [];
  collectHttpsUrls(containers, urls);
  if (result?.output) collectHttpsUrls(result.output, urls);
  return urls;
}

async function readJson(response, label, { allowArray = false } = {}) {
  let body;
  try { body = await response.json(); } catch { throw new FireflyApiError(`${label} was not valid JSON`); }
  if (!body || typeof body !== 'object' || (!allowArray && Array.isArray(body))) {
    throw new FireflyApiError(`${label} was not a JSON object`);
  }
  return body;
}

/** Build an injectable client for production and unit tests. */
export function createFireflyApiClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  let cachedToken;
  let expiresAt = 0;
  let refreshPromise;

  async function exchangeToken() {
    const config = loadConfig(env);
    const response = await fetchImpl(config.imsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: config.scopes,
      }).toString(),
    });
    if (!response.ok) throw new FireflyApiError(`Adobe IMS authentication failed (HTTP ${response.status})`);
    const body = await readJson(response, 'Adobe IMS response');
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new FireflyApiError('Adobe IMS response did not contain an access token');
    }
    const expiresInMs = Math.max(60, Number(body.expires_in) || 3600) * 1000;
    cachedToken = body.access_token;
    expiresAt = now() + expiresInMs - TOKEN_EXPIRY_BUFFER_MS;
    return cachedToken;
  }

  async function getToken() {
    if (cachedToken && now() < expiresAt) return cachedToken;
    if (!refreshPromise) refreshPromise = exchangeToken().finally(() => { refreshPromise = undefined; });
    return refreshPromise;
  }

  async function adobeRequest(url, { method = 'GET', body, headers = {} } = {}) {
    const config = loadConfig(env);
    const token = await getToken();
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': config.clientId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new FireflyApiError('Adobe Firefly API request failed');
    }
    if (!response.ok) throw new FireflyApiError(`Adobe Firefly API request failed (HTTP ${response.status})`);
    return response;
  }

  async function audioVideoSubmit(path, body, label) {
    const response = await adobeRequest(`${AUDIO_VIDEO_API_BASE}${path}`, { method: 'POST', body });
    const data = await readJson(response, label);
    const statusUrl = data.statusUrl;
    if (typeof statusUrl !== 'string') throw new FireflyApiError(`${label} did not contain a job handle`);
    const trustedStatusUrl = validateAdobeJobUrl(statusUrl);
    return { job_id: jobIdFrom(data, trustedStatusUrl), status_url: trustedStatusUrl, cancel_url: null };
  }

  return {
    capabilities() {
      return {
        configured: Boolean(env.FIREFLY_CLIENT_ID && env.FIREFLY_CLIENT_SECRET && env.FIREFLY_SCOPES),
        provider: 'Adobe Firefly Services',
        operation: 'Firefly image, video, speech, transcription, and dubbing',
        model_id: 'firefly_image',
        asynchronous: true,
        aspect_ratios: ['auto', '1:1', '4:3', '3:4', '16:9', '9:16'],
        max_prompt_characters: 1024,
        operations: {
          image: {
            model_id: 'firefly_image',
            model_version: 'image5',
            input: 'text',
          },
          video: {
            model_version: VIDEO_MODEL_VERSION,
            duration_seconds: 5,
            inputs: ['text', 'optional start/end keyframe URLs'],
            sizes: Object.keys(VIDEO_SIZES),
            supported_keyframe_hosts: KEYFRAME_HOSTS,
          },
          audio: {
            operations: ['voice catalog', 'text to speech', 'audio/video transcription and captions', 'audio/video dubbing with optional video lip sync'],
            max_script_characters: 20000,
            input_audio_types: ['audio/mp3', 'audio/wav', 'audio/aac'],
            input_video_types: ['video/mp4', 'video/quicktime'],
            asynchronous: true,
          },
        },
    notes: ['Generative and media-processing operations may consume Firefly entitlement/credits.', 'Submit calls are never retried automatically.'],
      };
    },

    async submitGenerate({ prompt, aspect_ratio = 'auto' }) {
      const config = loadConfig(env);
      const response = await adobeRequest(`${config.apiBase}/v4/images/generate-async`, {
        method: 'POST',
        headers: { 'x-model-version': 'image5' },
        body: {
          prompt,
          aspectRatio: aspect_ratio,
          resolutionLevel: '2.4MP',
          modelId: 'firefly_image',
          numVariations: 1,
          referenceBlobs: [],
        },
      });
      const data = await readJson(response, 'Adobe Firefly operation response');
      const statusUrl = data.statusUrl || linkHref(data, 'result');
      if (typeof statusUrl !== 'string') throw new FireflyApiError('Adobe Firefly response did not contain a job handle');
      const trustedStatusUrl = validateAdobeJobUrl(statusUrl);
      const cancelUrl = data.cancelUrl || linkHref(data, 'cancel');
      return {
        job_id: jobIdFrom(data, trustedStatusUrl),
        status_url: trustedStatusUrl,
        cancel_url: typeof cancelUrl === 'string' ? validateAdobeJobUrl(cancelUrl) : null,
      };
    },

    async submitVideoGenerate({
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
      const config = loadConfig(env);
      const dimensions = VIDEO_SIZES[size];
      if (!dimensions) throw new FireflyApiError('unsupported Firefly video size');

      const conditions = [];
      if (start_frame_url) {
        conditions.push({ source: { url: validateKeyframeUrl(start_frame_url) }, placement: { position: 0 } });
      }
      if (end_frame_url) {
        conditions.push({ source: { url: validateKeyframeUrl(end_frame_url) }, placement: { position: 1 } });
      }
      const videoSettings = {
        ...(camera_motion ? { cameraMotion: camera_motion } : {}),
        ...(prompt_style ? { promptStyle: prompt_style } : {}),
        ...(shot_angle ? { shotAngle: shot_angle } : {}),
        ...(shot_size ? { shotSize: shot_size } : {}),
      };
      const body = {
        prompt,
        sizes: [dimensions],
        bitRateFactor: bit_rate_factor,
        ...(seed === undefined ? {} : { seeds: [seed] }),
        ...(conditions.length ? { image: { conditions } } : {}),
        ...(Object.keys(videoSettings).length ? { videoSettings } : {}),
      };
      const response = await adobeRequest(`${config.apiBase}/v3/videos/generate`, {
        method: 'POST',
        headers: { 'x-model-version': VIDEO_MODEL_VERSION },
        body,
      });
      const data = await readJson(response, 'Adobe Firefly video operation response');
      const statusUrl = data.statusUrl || linkHref(data, 'result');
      if (typeof statusUrl !== 'string') throw new FireflyApiError('Adobe Firefly video response did not contain a job handle');
      const trustedStatusUrl = validateAdobeJobUrl(statusUrl);
      const cancelUrl = data.cancelUrl || linkHref(data, 'cancel');
      return {
        job_id: jobIdFrom(data, trustedStatusUrl),
        status_url: trustedStatusUrl,
        cancel_url: typeof cancelUrl === 'string' ? validateAdobeJobUrl(cancelUrl) : null,
      };
    },

    async listAudioVoices() {
      const response = await adobeRequest(`${AUDIO_VIDEO_API_BASE}/v1/voices`);
      const data = await readJson(response, 'Adobe Firefly voice catalog response', { allowArray: true });
      const raw = Array.isArray(data) ? data : Array.isArray(data.voices) ? data.voices : Array.isArray(data.data) ? data.data : [];
      return raw.slice(0, 200).map((voice) => ({
        id: String(voice.voiceId || voice.id || ''),
        name: String(voice.displayName || voice.name || ''),
        locale: String(voice.localeCode || voice.locale || ''),
        gender: String(voice.gender || ''),
        style: String(voice.style || voice.speakingStyle || ''),
      }));
    },

    async submitSpeech({ text, voice_id, locale_code = 'en-US', output_media_type = 'audio/wav' }) {
      return audioVideoSubmit('/v1/generate-speech', {
        script: { text, mediaType: 'text/plain', localeCode: locale_code },
        voiceId: voice_id,
        output: { mediaType: output_media_type },
      }, 'Adobe Firefly speech response');
    },

    async submitTranscribe({ media_kind, source_url, media_type, target_locale_codes = [], captions_format }) {
      return audioVideoSubmit('/v1/transcribe', {
        [media_kind]: { source: { url: validateMediaUrl(source_url) }, mediaType: media_type },
        ...(target_locale_codes.length ? { targetLocaleCodes: target_locale_codes } : {}),
        ...(captions_format ? { captions: { targetFormats: [captions_format] } } : {}),
      }, 'Adobe Firefly transcription response');
    },

    async submitDub({ media_kind, source_url, media_type, target_locale_codes, lip_sync = false }) {
      return audioVideoSubmit('/v1/dub', {
        [media_kind]: { source: { url: validateMediaUrl(source_url) }, mediaType: media_type },
        targetLocaleCodes: target_locale_codes,
        lipSync: String(Boolean(lip_sync)),
      }, 'Adobe Firefly dubbing response');
    },

    async getJobStatus(statusUrl) {
      const trustedUrl = validateAdobeJobUrl(statusUrl);
      const response = await adobeRequest(trustedUrl);
      const data = await readJson(response, 'Adobe Firefly status response');
      return {
        job_id: jobIdFrom(data, trustedUrl),
        status: String(data.status || 'unknown').toLowerCase(),
        output_urls: extractOutputUrls(data),
        adobe: data,
      };
    },

    async cancelJob(cancelUrl) {
      const trustedUrl = validateAdobeJobUrl(cancelUrl, { cancel: true });
      await adobeRequest(trustedUrl, { method: 'PUT' });
      return { cancelled: true, job_id: jobIdFrom({}, trustedUrl) };
    },
  };
}

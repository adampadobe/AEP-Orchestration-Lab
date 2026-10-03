'use strict';

const admin = require('firebase-admin');
const core = require('./pdfPersonalisationCore');
const creative = require('./creativeImageService');
const travelPrompt = require('./pdfTravelImagePrompt');

const PROVIDERS = new Set(['firefly', 'foundry']);
const DEFAULT_BUCKET = 'aep-orchestration-lab-brand-scrapes';
const OBJECT_PREFIX = 'pdf-personalisation/generated';
const IMAGE_FIELD = 'FF_Image';
const DEADLINES_MS = { firefly: 90_000, foundry: 150_000 };

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function truthy(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function normaliseImageGeneration(input = {}) {
  const body = plainObject(input) ? input : {};
  const options = plainObject(body.imageGeneration) ? body.imageGeneration : {};
  if (!truthy(options.enabled) && !truthy(body.generateImage)) return null;
  const provider = String(options.provider || body.imageProvider || 'firefly').trim().toLowerCase();
  if (!PROVIDERS.has(provider)) {
    throw new core.PdfPersonalisationError(
      'imageGeneration.provider must be "firefly" or "foundry".',
      400,
      'PDF_IMAGE_PROVIDER_INVALID',
    );
  }
  return {
    enabled: true,
    provider,
    aspectRatio: creative.normaliseAspectRatio(options.aspectRatio || body.imageAspectRatio),
  };
}

function ensureAdmin() {
  try {
    admin.app();
  } catch (_error) {
    admin.initializeApp();
  }
}

function createGcsImageStore(options = {}) {
  const bucketName = options.bucketName || process.env.BRAND_SCRAPER_BUCKET || DEFAULT_BUCKET;
  const bucket = () => {
    ensureAdmin();
    return admin.storage().bucket(bucketName);
  };
  const objectPath = (hash) => `${OBJECT_PREFIX}/${hash}.jpg`;
  const publicUrl = (hash) => `https://storage.googleapis.com/${bucketName}/${objectPath(hash)}`;
  return {
    async lookup(hash) {
      const [exists] = await bucket().file(objectPath(hash)).exists();
      return exists ? publicUrl(hash) : null;
    },
    async save(hash, buffer, metadata = {}) {
      const file = bucket().file(objectPath(hash));
      await file.save(buffer, {
        resumable: false,
        contentType: 'image/jpeg',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            provider: String(metadata.provider || ''),
            model: String(metadata.model || ''),
            destination: String(metadata.destination || ''),
          },
        },
      });
      try { await file.makePublic(); } catch (_error) { /* uniform bucket access grants public read */ }
      return publicUrl(hash);
    },
  };
}

function creativeClient(deps) {
  if (deps.creativeImageClient) return deps.creativeImageClient;
  return creative.createCreativeImageClient({
    getToken: deps.getCreativeToken,
    getApiKey: deps.getCreativeApiKey,
    fetch: deps.creativeFetch,
    sleep: deps.sleep,
    env: deps.creativeEnv || process.env,
  });
}

async function generateTravelImage({ data, provider = 'firefly', aspectRatio } = {}, deps = {}) {
  const prompt = travelPrompt.buildTravelImagePrompt(data);
  if (!prompt) {
    throw new core.PdfPersonalisationError(
      'Booking data needs a destination (destinationCity, arrivalAirportName, or arrivalAirport) to generate an image.',
      422,
      'PDF_IMAGE_DESTINATION_MISSING',
    );
  }
  const client = creativeClient(deps);
  const aspect = creative.normaliseAspectRatio(aspectRatio);
  if (provider === 'foundry' && !client.foundryModelId) {
    throw new creative.CreativeImageError(
      'Firefly Foundry is not configured (FOUNDRY_MODEL_ID).',
      'FOUNDRY_NOT_CONFIGURED',
      503,
    );
  }
  const model = provider === 'foundry' ? client.foundryModelId : 'image5';
  const hash = travelPrompt.promptHash({ provider, model, prompt: prompt.prompt, aspectRatio: aspect });
  const store = deps.generatedImageStore || createGcsImageStore();
  const base = {
    provider,
    model,
    promptHash: hash,
    destination: prompt.destination,
    prompt: prompt.prompt,
    aspectRatio: aspect,
  };
  const cachedUrl = await store.lookup(hash);
  if (cachedUrl) return { ...base, status: 'cached', url: cachedUrl };

  const generated = provider === 'foundry'
    ? await client.generateFoundry({
      prompt: prompt.prompt,
      aspectRatio: aspect,
      negativePrompt: prompt.negativePrompt,
      deadlineMs: DEADLINES_MS.foundry,
    })
    : await client.generateFirefly({ prompt: prompt.prompt, aspectRatio: aspect, deadlineMs: DEADLINES_MS.firefly });
  const downloaded = await client.downloadImage(generated.sourceUrl);
  const jpeg = await (deps.toPdfJpeg || creative.toPdfJpeg)(downloaded);
  const url = await store.save(hash, jpeg, base);
  return { ...base, status: 'generated', url };
}

function availableProviders(deps = {}) {
  try {
    return creativeClient(deps).providers();
  } catch (_error) {
    return { firefly: false, foundry: false };
  }
}

/** Portal preview: same cache and generation path, surfaced as an HTTP-safe error. */
async function previewTravelImage(input, deps = {}) {
  try {
    return await generateTravelImage(input, deps);
  } catch (error) {
    if (error instanceof core.PdfPersonalisationError) throw error;
    if (error instanceof creative.CreativeImageError) {
      throw new core.PdfPersonalisationError(
        error.message,
        error.status >= 400 && error.status < 600 ? error.status : 502,
        error.code,
      );
    }
    throw error;
  }
}

function applyImageToData(data, url, mappings) {
  const output = plainObject(data) ? { ...data } : {};
  output[IMAGE_FIELD] = url;
  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    if (mapping && mapping.source === IMAGE_FIELD && mapping.target) output[mapping.target] = url;
  });
  return output;
}

/**
 * Resolves the generated image for a queued journey job. Never throws for a
 * generation failure: the send continues with the caller's original image.
 */
async function resolveForRecord(record, deps = {}) {
  const options = record && record.imageGeneration;
  if (!options || !options.enabled) return null;
  const resolvedAt = (deps.now ? deps.now() : new Date()).toISOString();
  try {
    const image = await generateTravelImage({
      data: record.data,
      provider: options.provider,
      aspectRatio: options.aspectRatio,
    }, deps);
    return {
      data: applyImageToData(record.data, image.url, record.templateFieldMappings),
      fields: {
        imageStatus: image.status,
        imageProvider: image.provider,
        imageModel: image.model,
        imageUrl: image.url,
        imagePromptHash: image.promptHash,
        imageDestination: image.destination,
        imageError: null,
        imageResolvedAt: resolvedAt,
      },
    };
  } catch (error) {
    if (deps.logger && typeof deps.logger.warn === 'function') {
      deps.logger.warn('pdf journey image generation fell back', {
        code: error && error.code,
        provider: options.provider,
      });
    }
    const fallbackUrl = record.data && typeof record.data[IMAGE_FIELD] === 'string' ? record.data[IMAGE_FIELD] : null;
    return {
      data: record.data,
      fields: {
        imageStatus: 'fallback',
        imageProvider: options.provider,
        imageModel: null,
        imageUrl: fallbackUrl,
        imagePromptHash: null,
        imageDestination: null,
        imageError: {
          code: String(error && error.code || 'PDF_IMAGE_GENERATION_FAILED').slice(0, 100),
          message: String(error && error.message || 'Image generation failed.').slice(0, 300),
        },
        imageResolvedAt: resolvedAt,
      },
    };
  }
}

module.exports = {
  IMAGE_FIELD,
  OBJECT_PREFIX,
  applyImageToData,
  availableProviders,
  createGcsImageStore,
  generateTravelImage,
  normaliseImageGeneration,
  previewTravelImage,
  resolveForRecord,
};

/**
 * Hosts a generated weather-map PNG at a plain HTTPS URL, for MCP clients
 * (e.g. Adobe Coworker) that render markdown image links but don't yet
 * render inline MCP `type: "image"` content blocks. The bucket
 * (aep-orchestration-lab-weather-maps) is dedicated to this one purpose,
 * grants allUsers:objectViewer only (no bucket listing), uses random
 * unguessable object names, and auto-deletes every object after 1 day.
 */

import { randomUUID } from 'node:crypto';

const BUCKET_NAME = 'aep-orchestration-lab-weather-maps';

let bucket = null;
let initAttempted = false;

async function getBucket() {
  if (initAttempted) return bucket;
  initAttempted = true;
  try {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getStorage } = await import('firebase-admin/storage');
    if (!getApps().length) {
      initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'aep-orchestration-lab' });
    }
    bucket = getStorage().bucket(BUCKET_NAME);
  } catch (err) {
    console.warn('[aep-lab-profile-mcp] weather map storage unavailable:', err?.message || err);
    bucket = null;
  }
  return bucket;
}

/**
 * @param {{ base64: string, mimeType: string }} params
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
export async function uploadWeatherMapImage({ base64, mimeType }) {
  const target = await getBucket();
  if (!target) return { ok: false, error: 'Weather map storage is not configured on the server.' };

  const ext = mimeType === 'image/png' ? 'png' : 'img';
  const objectName = `${Date.now()}-${randomUUID()}.${ext}`;
  const file = target.file(objectName);

  try {
    await file.save(Buffer.from(base64, 'base64'), {
      contentType: mimeType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=3600' },
    });
    return { ok: true, url: `https://storage.googleapis.com/${BUCKET_NAME}/${objectName}` };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

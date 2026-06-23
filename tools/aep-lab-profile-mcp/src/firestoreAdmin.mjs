/**
 * Shared Firebase Admin / Firestore init for Cloud Run (ADC) and local dev.
 */

let firestore = null;
let initAttempted = false;

/**
 * @returns {Promise<import('firebase-admin/firestore').Firestore | null>}
 */
export async function getFirestoreDb() {
  if (initAttempted) return firestore;
  initAttempted = true;

  if (String(process.env.AEP_LAB_MCP_FIRESTORE || '').toLowerCase() === 'off') {
    console.warn('[aep-lab-profile-mcp] Firestore disabled (AEP_LAB_MCP_FIRESTORE=off).');
    return null;
  }

  try {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) {
      initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'aep-orchestration-lab' });
    }
    firestore = getFirestore();
    console.log(JSON.stringify({ type: 'aep-lab-profile-mcp-firestore', ok: true }));
  } catch (err) {
    console.warn('[aep-lab-profile-mcp] Firestore unavailable:', err?.message || err);
    firestore = null;
  }
  return firestore;
}

export function isFirestoreEnabled() {
  return firestore != null;
}

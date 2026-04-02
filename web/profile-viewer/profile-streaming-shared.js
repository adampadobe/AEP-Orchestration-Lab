/**
 * Shared helpers for Profile Viewer, Consent Manager, and Profile Generation streaming responses
 * (/api/profile/update, /api/profile/generate).
 */
(function (global) {
  /**
   * @returns {{ url: string, flowId: string, datasetId: string, datasetName: string, schemaId: string, datasetInPayload: boolean } | null}
   */
  function resolveProfileStreamingUiFields(data) {
    if (!data || typeof data !== 'object') return null;
    const sent = data.sentToAep;
    const envHeader = sent && typeof sent === 'object' ? sent.header : null;
    const envDatasetId = envHeader && envHeader.datasetId != null ? String(envHeader.datasetId) : '';
    const envSchemaId =
      envHeader && envHeader.schemaRef && envHeader.schemaRef.id != null ? String(envHeader.schemaRef.id) : '';
    const url = String(data.profileStreamingUrl || data.requestUrl || data.url || '').trim();
    let flowId = data.profileStreamingFlowId != null ? String(data.profileStreamingFlowId) : '';
    if (!flowId && data.requestHeaders && typeof data.requestHeaders === 'object') {
      const xf = data.requestHeaders['x-adobe-flow-id'];
      if (xf != null && String(xf).trim()) flowId = String(xf).trim();
    }
    let datasetId = data.profileStreamingDatasetId != null ? String(data.profileStreamingDatasetId) : '';
    let datasetName =
      data.profileStreamingDatasetQualifiedName != null ? String(data.profileStreamingDatasetQualifiedName) : '';
    let schemaId = data.profileStreamingSchemaId != null ? String(data.profileStreamingSchemaId) : '';
    if (!datasetId && envDatasetId) datasetId = envDatasetId;
    if (!schemaId && envSchemaId) schemaId = envSchemaId;
    let datasetInPayload;
    if (typeof data.profileStreamingDatasetInPayload === 'boolean') {
      datasetInPayload = data.profileStreamingDatasetInPayload;
    } else {
      datasetInPayload = !!(envHeader && sent.body != null);
    }
    if (!url && !datasetId && !datasetName && !schemaId && !flowId) return null;
    return { url, flowId, datasetId, datasetName, schemaId, datasetInPayload };
  }

  function formatAepPayloadPreContent(data) {
    const chunks = [];
    const meta = resolveProfileStreamingUiFields(data);
    if (meta) {
      const lines = ['--- Profile streaming target ---'];
      if (meta.url) lines.push(`URL: ${meta.url}`);
      if (meta.flowId) lines.push(`Flow ID: ${meta.flowId}`);
      if (meta.datasetId) lines.push(`Dataset ID: ${meta.datasetId}`);
      if (meta.datasetName) lines.push(`Dataset (qualified name): ${meta.datasetName}`);
      if (meta.schemaId) lines.push(`Schema ID: ${meta.schemaId}`);
      if (meta.datasetInPayload === false) {
        lines.push('(Bare payload — dataset/schema IDs are not in the POST body; matches Postman raw JSON.)');
      }
      chunks.push(lines.join('\n'));
    }
    if (data.payloadFormat) {
      chunks.push(
        `--- Payload format: ${data.payloadFormat} (default bare JSON like Postman; set AEP_PROFILE_STREAMING_ENVELOPE=1 for DCS envelope) ---`,
      );
    }
    if (data.sentToAep != null) {
      chunks.push(JSON.stringify(data.sentToAep, null, 2));
    }
    if (
      data.streamingResponse != null &&
      typeof data.streamingResponse === 'object' &&
      Object.keys(data.streamingResponse).length
    ) {
      chunks.push(`--- AEP streaming response ---\n${JSON.stringify(data.streamingResponse, null, 2)}`);
    }
    if (data.dataflowHint) {
      chunks.push(`--- Note ---\n${data.dataflowHint}`);
    }
    return chunks.join('\n\n');
  }

  /**
   * POST /api/profile/update — same endpoint for attribute edits (updates[]) and consent (consent object).
   * @param {{ email: string, ecid: string, sandbox?: string, updates?: Array<{ path: string, value: unknown }>, consent?: Record<string, unknown> }} body
   */
  async function postProfileUpdate(body) {
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { ok: res.ok, res, data };
  }

  /** Rich error line for failed profile streaming (matches Profile Viewer “Update profile” handling). */
  function formatProfileUpdateError(data) {
    if (!data || typeof data !== 'object') return 'Update failed.';
    let errMsg = data.error || data.message || 'Update failed.';
    if (Array.isArray(data.skippedPaths) && data.skippedPaths.length) {
      errMsg += ` Skipped invalid paths: ${data.skippedPaths.slice(0, 8).join(', ')}`;
    }
    if (data.edgeBody) errMsg += ' ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 150);
    if (data.streamingReport && data.streamingReport.message) {
      errMsg += ' [' + String(data.streamingReport.message) + ']';
    }
    if (data.streamingDetail && String(data.streamingDetail) !== String(data.error)) {
      errMsg += ' Detail: ' + String(data.streamingDetail).slice(0, 200);
    }
    if (data.streamingInvalidFields && Array.isArray(data.streamingInvalidFields) && data.streamingInvalidFields.length) {
      errMsg +=
        ' Invalid: ' +
        data.streamingInvalidFields.slice(0, 5).map((f) => (f && (f.path || f.field || f.message)) || f).join(', ');
    } else if (data.streamingInvalidFields && typeof data.streamingInvalidFields === 'object') {
      errMsg += ' Invalid: ' + JSON.stringify(data.streamingInvalidFields).slice(0, 150);
    }
    if (data.streamingStatus) errMsg += ' (HTTP ' + data.streamingStatus + ')';
    if (data.hint && String(data.hint).trim()) errMsg += ' ' + String(data.hint).trim();
    return errMsg;
  }

  global.resolveProfileStreamingUiFields = resolveProfileStreamingUiFields;
  global.formatAepPayloadPreContent = formatAepPayloadPreContent;
  global.postProfileUpdate = postProfileUpdate;
  global.formatProfileUpdateError = formatProfileUpdateError;
})(typeof window !== 'undefined' ? window : globalThis);

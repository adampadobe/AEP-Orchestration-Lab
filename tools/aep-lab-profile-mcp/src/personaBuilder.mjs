/**
 * Re-export persona builder (Phase 3.1 — industry submodules).
 * @deprecated Import from ./personaBuilder/index.mjs directly in new code.
 */
export {
  buildCommonPersonaAttributes,
  buildPersonaAttributes,
  resolveBatchEmail,
  normalizeSegmentHint,
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
  SEGMENT_HINTS_BY_INDUSTRY,
} from './personaBuilder/index.mjs';

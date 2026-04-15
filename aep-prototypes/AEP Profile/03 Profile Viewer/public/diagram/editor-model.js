/**
 * DiagramModel — typed view + validation over master layout JSON (v8+).
 * Playback state machine (STATES) is separate; this covers editable geometry/overlays.
 *
 * @fileoverview JSDoc typedefs + import/export helpers for aep-architecture-apps master payload.
 */
(function (global) {
  'use strict';

  /**
   * @typedef {{ x: number, y: number, w?: number, h?: number }} NodeOffsetModel
   */

  /**
   * @typedef {{
   *   pos?: Record<string, { x?: number, y?: number }>,
   *   content?: Record<string, string>
   * }} LabelsModel
   */

  /**
   * @typedef {{
   *   version: number,
   *   savedAt?: string,
   *   nodes?: Record<string, NodeOffsetModel>,
   *   labels?: LabelsModel,
   *   userLines?: Array<Record<string, *>>,
   *   stateHighlightOverrides?: Record<string, string[]>,
   *   sourcesDividers?: Array<Record<string, *>>,
   *   customBoxes?: Array<Record<string, *>>,
   *   scene?: Record<string, *>
   * }} DiagramModel
   */

  var EXPECTED_VERSION = 8;

  /**
   * @param {*} raw
   * @returns {DiagramModel}
   */
  function fromMasterPayload(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var M = global.AEPDiagram && global.AEPDiagram.model;
    if (M && typeof M.migrateLayout === 'function') {
      d = M.migrateLayout(JSON.parse(JSON.stringify(d)));
    }
    return {
      version: typeof d.version === 'number' ? d.version : EXPECTED_VERSION,
      savedAt: typeof d.savedAt === 'string' ? d.savedAt : undefined,
      nodes: d.nodes && typeof d.nodes === 'object' ? d.nodes : {},
      labels:
        d.labels && typeof d.labels === 'object'
          ? { pos: d.labels.pos || {}, content: d.labels.content || {} }
          : undefined,
      userLines: Array.isArray(d.userLines) ? d.userLines.slice() : [],
      stateHighlightOverrides:
        d.stateHighlightOverrides && typeof d.stateHighlightOverrides === 'object'
          ? JSON.parse(JSON.stringify(d.stateHighlightOverrides))
          : {},
      sourcesDividers: Array.isArray(d.sourcesDividers) ? d.sourcesDividers.slice() : [],
      customBoxes: Array.isArray(d.customBoxes) ? d.customBoxes.slice() : [],
      scene: d.scene && typeof d.scene === 'object' ? JSON.parse(JSON.stringify(d.scene)) : undefined,
    };
  }

  /**
   * Strips undefined keys; suitable for JSON.stringify / download.
   * @param {DiagramModel} model
   * @returns {Record<string, *>}
   */
  function toSerializablePayload(model) {
    if (!model || typeof model !== 'object') return { version: EXPECTED_VERSION };
    var out = {
      version: typeof model.version === 'number' ? model.version : EXPECTED_VERSION,
      savedAt: new Date().toISOString(),
    };
    if (model.nodes && typeof model.nodes === 'object') out.nodes = JSON.parse(JSON.stringify(model.nodes));
    if (model.labels && typeof model.labels === 'object') out.labels = JSON.parse(JSON.stringify(model.labels));
    if (Array.isArray(model.userLines)) out.userLines = JSON.parse(JSON.stringify(model.userLines));
    if (model.stateHighlightOverrides && typeof model.stateHighlightOverrides === 'object') {
      out.stateHighlightOverrides = JSON.parse(JSON.stringify(model.stateHighlightOverrides));
    }
    if (Array.isArray(model.sourcesDividers)) out.sourcesDividers = JSON.parse(JSON.stringify(model.sourcesDividers));
    if (Array.isArray(model.customBoxes)) out.customBoxes = JSON.parse(JSON.stringify(model.customBoxes));
    if (model.scene && typeof model.scene === 'object') out.scene = JSON.parse(JSON.stringify(model.scene));
    return out;
  }

  /**
   * @param {*} x
   * @returns {boolean}
   */
  function isFiniteNumber(x) {
    return typeof x === 'number' && isFinite(x);
  }

  /**
   * @param {*} data
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateDiagramModel(data) {
    var errors = [];
    if (!data || typeof data !== 'object') {
      errors.push('payload must be an object');
      return { ok: false, errors: errors };
    }
    if (typeof data.version !== 'number' || data.version !== EXPECTED_VERSION) {
      errors.push('version must be ' + EXPECTED_VERSION + ' (run migrateLayout for older files)');
    }
    if (data.nodes != null && typeof data.nodes !== 'object') {
      errors.push('nodes must be an object when present');
    } else if (data.nodes && typeof data.nodes === 'object') {
      Object.keys(data.nodes).forEach(function (k) {
        var n = data.nodes[k];
        if (!n || typeof n !== 'object') {
          errors.push('nodes[' + k + '] must be an object');
          return;
        }
        if (!isFiniteNumber(n.x)) errors.push('nodes[' + k + '].x must be a finite number');
        if (!isFiniteNumber(n.y)) errors.push('nodes[' + k + '].y must be a finite number');
        if (n.w != null && !isFiniteNumber(n.w)) errors.push('nodes[' + k + '].w must be a finite number when set');
        if (n.h != null && !isFiniteNumber(n.h)) errors.push('nodes[' + k + '].h must be a finite number when set');
      });
    }
    if (data.labels != null && typeof data.labels !== 'object') {
      errors.push('labels must be an object when present');
    }
    if (data.userLines != null && !Array.isArray(data.userLines)) {
      errors.push('userLines must be an array when present');
    } else if (Array.isArray(data.userLines)) {
      data.userLines.forEach(function (ln, i) {
        if (!ln || typeof ln !== 'object') {
          errors.push('userLines[' + i + '] must be an object');
          return;
        }
        if (ln.id != null && typeof ln.id !== 'string' && typeof ln.id !== 'number') {
          errors.push('userLines[' + i + '].id must be string or number when set');
        }
      });
    }
    if (data.stateHighlightOverrides != null && typeof data.stateHighlightOverrides !== 'object') {
      errors.push('stateHighlightOverrides must be an object when present');
    }
    if (data.sourcesDividers != null && !Array.isArray(data.sourcesDividers)) {
      errors.push('sourcesDividers must be an array when present');
    }
    if (data.customBoxes != null && !Array.isArray(data.customBoxes)) {
      errors.push('customBoxes must be an array when present');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.editorModel = {
    VERSION: EXPECTED_VERSION,
    fromMasterPayload: fromMasterPayload,
    toSerializablePayload: toSerializablePayload,
    validateDiagramModel: validateDiagramModel,
  };
})(typeof window !== 'undefined' ? window : this);

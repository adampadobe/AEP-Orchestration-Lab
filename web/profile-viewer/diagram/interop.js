/**
 * Phase 4 — interchange: portable stack summary derived from master layout JSON.
 * Does not embed third-party vendor databases; only paths/labels already on the canvas.
 * @fileoverview
 */
(function (global) {
  'use strict';

  var FORMAT_ID = 'aep-orchestration-lab-stack-summary';
  var FORMAT_VERSION = 1;

  /**
   * @param {*} payload — output shape of archMasterSerialize() (version, customBoxes, userLines, …)
   * @returns {Record<string, *>}
   */
  function exportStackSummaryFromPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return {
        format: FORMAT_ID,
        formatVersion: FORMAT_VERSION,
        error: 'invalid payload',
      };
    }

    var vendors = [];
    var cbs = payload.customBoxes;
    if (Array.isArray(cbs)) {
      cbs.forEach(function (b) {
        if (!b || typeof b !== 'object') return;
        var entry = {
          boxId: typeof b.id === 'string' ? b.id : undefined,
          name: typeof b.name === 'string' ? b.name : '',
          x: typeof b.x === 'number' ? b.x : 0,
          y: typeof b.y === 'number' ? b.y : 0,
          w: typeof b.w === 'number' ? b.w : undefined,
          h: typeof b.h === 'number' ? b.h : undefined,
          kind: typeof b.kind === 'string' ? b.kind : 'box',
        };
        if (b.kind === 'productLogo' && typeof b.logoFile === 'string' && b.logoFile) {
          entry.kind = 'productLogo';
          entry.assetPath = b.logoFile;
          entry.caption = entry.name || (typeof b.logoDescription === 'string' ? b.logoDescription : '');
        } else if (b.kind === 'spectrumIcon' && typeof b.iconFile === 'string' && b.iconFile) {
          entry.kind = 'spectrumIcon';
          entry.assetPath = b.iconFile;
        }
        vendors.push(entry);
      });
    }

    var connectors = [];
    var lines = payload.userLines;
    if (Array.isArray(lines)) {
      lines.forEach(function (ln) {
        if (!ln || typeof ln !== 'object') return;
        var c = {
          id: ln.id != null ? String(ln.id) : undefined,
          stroke: typeof ln.stroke === 'string' ? ln.stroke : undefined,
          strokeWidth: typeof ln.strokeWidth === 'number' ? ln.strokeWidth : undefined,
        };
        if (ln.points) c.points = ln.points;
        if (ln.from) c.from = ln.from;
        if (ln.to) c.to = ln.to;
        connectors.push(c);
      });
    }

    var nodeKeys = payload.nodes && typeof payload.nodes === 'object' ? Object.keys(payload.nodes) : [];

    return {
      format: FORMAT_ID,
      formatVersion: FORMAT_VERSION,
      about:
        'Portable vendor/icon positions + connector geometry for tooling. For full round-trip (undo, highlights, exact layout), use the master layout JSON from “Download JSON”.',
      source: {
        app: 'aep-architecture-apps',
        masterLayoutVersion: typeof payload.version === 'number' ? payload.version : undefined,
        savedAt: typeof payload.savedAt === 'string' ? payload.savedAt : undefined,
        canonicalNodeIds: nodeKeys,
      },
      spec: 'data/diagram-interop.json',
      taxonomy: 'data/martech-taxonomy-reference.json',
      vendors: vendors,
      connectors: connectors,
    };
  }

  /**
   * @param {Array<*>} logos — architecture-logos.json `logos` array
   * @returns {Record<string, string[]>} map asset path → tag ids
   */
  function buildCatalogTagMapFromLogos(logos) {
    var m = {};
    if (!Array.isArray(logos)) return m;
    logos.forEach(function (e) {
      if (!e || typeof e.file !== 'string' || !e.file) return;
      var tags = Array.isArray(e.tags) ? e.tags.filter(Boolean) : [];
      if (tags.length) m[e.file] = tags.slice();
    });
    return m;
  }

  /**
   * Mutates summary.vendors in place: adds catalogTags when assetPath matches architecture-logos.json.
   * @param {*} summary
   * @param {Record<string, string[]>} tagMap
   */
  function enrichStackSummaryWithCatalogTags(summary, tagMap) {
    if (!summary || typeof summary !== 'object' || !tagMap || typeof tagMap !== 'object') return;
    var vendors = summary.vendors;
    if (!Array.isArray(vendors)) return;
    vendors.forEach(function (v) {
      if (!v || typeof v.assetPath !== 'string') return;
      var t = tagMap[v.assetPath];
      if (t && t.length) v.catalogTags = t.slice();
    });
  }

  /**
   * @param {*} raw — parsed JSON
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateStackSummaryForImport(raw) {
    var errors = [];
    if (!raw || typeof raw !== 'object') {
      errors.push('payload must be an object');
      return { ok: false, errors: errors };
    }
    if (raw.format !== FORMAT_ID) {
      errors.push('format must be "' + FORMAT_ID + '"');
    }
    if (raw.formatVersion !== FORMAT_VERSION) {
      errors.push('formatVersion must be ' + FORMAT_VERSION);
    }
    if (raw.vendors != null && !Array.isArray(raw.vendors)) {
      errors.push('vendors must be an array when present');
    } else if (Array.isArray(raw.vendors)) {
      raw.vendors.forEach(function (v, i) {
        if (!v || typeof v !== 'object') {
          errors.push('vendors[' + i + '] must be an object');
          return;
        }
        if (typeof v.assetPath !== 'string' || !v.assetPath) {
          errors.push('vendors[' + i + '].assetPath is required');
        }
        var k = v.kind;
        if (k !== 'productLogo' && k !== 'spectrumIcon') {
          errors.push('vendors[' + i + '].kind must be productLogo or spectrumIcon');
        }
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.interop = {
    FORMAT_ID: FORMAT_ID,
    FORMAT_VERSION: FORMAT_VERSION,
    exportStackSummaryFromPayload: exportStackSummaryFromPayload,
    buildCatalogTagMapFromLogos: buildCatalogTagMapFromLogos,
    enrichStackSummaryWithCatalogTags: enrichStackSummaryWithCatalogTags,
    validateStackSummaryForImport: validateStackSummaryForImport,
  };
})(typeof window !== 'undefined' ? window : this);

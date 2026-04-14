/**
 * Unified scene graph + layout versioning (vanilla JS, no dependencies).
 * Consumed by aep-architecture-apps.js for master JSON v8+.
 */
(function (global) {
  'use strict';

  var VERSION = 8;

  function emptyScene() {
    return {
      nodes: {},
      edges: {},
      guides: {},
      groups: {},
    };
  }

  /**
   * Build a normalized scene snapshot from legacy master-layout fields (v7 shape).
   * IDs are stable strings: custom box id, user line id, divider id.
   */
  function legacyToScene(layout) {
    var scene = emptyScene();
    if (!layout || typeof layout !== 'object') return scene;

    var cbs = layout.customBoxes;
    if (Array.isArray(cbs)) {
      cbs.forEach(function (b) {
        if (!b || typeof b.id !== 'string') return;
        scene.nodes[b.id] = Object.assign({ kind: 'customBox' }, b);
      });
    }

    var lines = layout.userLines;
    if (Array.isArray(lines)) {
      lines.forEach(function (ln) {
        if (!ln || !ln.id) return;
        scene.edges[String(ln.id)] = Object.assign({ kind: 'connector' }, ln);
      });
    }

    var divs = layout.sourcesDividers;
    if (Array.isArray(divs)) {
      divs.forEach(function (g, i) {
        if (!g) return;
        var gid = typeof g.id === 'string' ? g.id : 'guide-' + i;
        scene.guides[gid] = Object.assign({ kind: 'sourceDivider' }, g, { id: gid });
      });
    }

    return scene;
  }

  function normalizeScene(scene) {
    var s = scene && typeof scene === 'object' ? scene : emptyScene();
    if (!s.nodes || typeof s.nodes !== 'object') s.nodes = {};
    if (!s.edges || typeof s.edges !== 'object') s.edges = {};
    if (!s.guides || typeof s.guides !== 'object') s.guides = {};
    if (!s.groups || typeof s.groups !== 'object') s.groups = {};
    return s;
  }

  /**
   * Migrate any prior layout object to { version: 8, scene, ...preserved }.
   * Deep-clones to avoid mutating caller references.
   */
  function migrateLayout(raw) {
    var d = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
    var v = Number(d.version) || 0;

    if (v < VERSION) {
      d.scene = legacyToScene(d);
    } else if (!d.scene || typeof d.scene !== 'object') {
      d.scene = legacyToScene(d);
    }
    d.scene = normalizeScene(d.scene);
    d.version = VERSION;
    if (!d.savedAt) d.savedAt = new Date().toISOString();
    return d;
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.model = {
    VERSION: VERSION,
    emptyScene: emptyScene,
    legacyToScene: legacyToScene,
    normalizeScene: normalizeScene,
    migrateLayout: migrateLayout,
  };
})(typeof window !== 'undefined' ? window : this);

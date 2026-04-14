/**
 * Lightweight sanity checks (no test framework). Enable with ?diagramTests=1
 */
(function (global) {
  'use strict';

  function run() {
    var M = global.AEPDiagram && global.AEPDiagram.model;
    if (!M) {
      console.warn('[diagram.tests] AEPDiagram.model missing');
      return;
    }

    var v7 = {
      version: 7,
      customBoxes: [{ id: 'cbox-1', x: 10, y: 20, w: 80, h: 40, name: 'A', fill: '#eee', stroke: '#999', labelFontSize: 8.5 }],
      userLines: [{ id: 'ul-1', from: { kind: 'free', x: 0, y: 0 }, to: { kind: 'free', x: 1, y: 1 }, stroke: '#308fff', strokeWidth: 2.2 }],
      sourcesDividers: [{ id: 'sep-1', x1: 30, x2: 100, y: 166, stroke: '#ccc', strokeWidth: 0.75 }],
    };

    var m8 = M.migrateLayout(v7);
    console.assert(m8.version === M.VERSION, 'migrate bumps version');
    console.assert(m8.scene && m8.scene.nodes['cbox-1'], 'scene has custom node');
    console.assert(m8.scene.edges['ul-1'], 'scene has edge');
    console.assert(m8.scene.guides['sep-1'], 'scene has guide');

    var scene = M.legacyToScene(v7);
    console.assert(scene.nodes['cbox-1'].kind === 'customBox', 'node kind');
    console.assert(scene.edges['ul-1'].kind === 'connector', 'edge kind');

    var align = global.AEPDiagram && global.AEPDiagram.layoutMath && global.AEPDiagram.layoutMath.alignLeft;
    if (align) {
      var rects = [
        { x: 10, y: 0, w: 10, h: 10 },
        { x: 50, y: 5, w: 10, h: 10 },
      ];
      align(rects);
      console.assert(rects[0].x === 10 && rects[1].x === 10, 'align left');
    }

    console.info('[diagram.tests] OK');
  }

  try {
    if (typeof location !== 'undefined' && /[?&]diagramTests=1(?:&|$)/.test(location.search)) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
    }
  } catch (e) {
    console.warn('[diagram.tests]', e);
  }
})(typeof window !== 'undefined' ? window : this);

/**
 * Patch-based undo stack (JSON-serializable snapshots).
 * Wire to editor actions in aep-architecture-apps.js incrementally.
 */
(function (global) {
  'use strict';

  function createUndoStack(options) {
    var max = (options && options.max) || 80;
    var past = [];
    var future = [];
    var deepClone =
      global.structuredClone ||
      function (x) {
        return JSON.parse(JSON.stringify(x));
      };

    return {
      /** Push a new snapshot after an edit; clears redo branch. */
      push: function (snapshot) {
        if (snapshot === undefined) return;
        past.push(deepClone(snapshot));
        if (past.length > max) past.shift();
        future.length = 0;
      },
      canUndo: function () {
        return past.length > 1;
      },
      canRedo: function () {
        return future.length > 0;
      },
      /** Returns previous snapshot or null; moves current to redo. */
      undo: function () {
        if (past.length < 2) return null;
        var cur = past.pop();
        future.push(cur);
        return deepClone(past[past.length - 1]);
      },
      /** Returns next snapshot or null. */
      redo: function () {
        if (!future.length) return null;
        var next = future.pop();
        past.push(next);
        return deepClone(next);
      },
      /** Seed initial state without clearing undo (e.g. after load). */
      resetWithSnapshot: function (snapshot) {
        past.length = 0;
        future.length = 0;
        if (snapshot !== undefined) past.push(deepClone(snapshot));
      },
      peek: function () {
        if (!past.length) return null;
        return deepClone(past[past.length - 1]);
      },
    };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.undo = {
    createStack: createUndoStack,
  };
})(typeof window !== 'undefined' ? window : this);

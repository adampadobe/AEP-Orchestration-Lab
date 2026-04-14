/**
 * Multi-select + primary id for property strips (vanilla JS).
 * Shift-click / marquee wiring lives in the page; this is the data shape.
 */
(function (global) {
  'use strict';

  function createSelection() {
    var ids = new Set();
    var primary = null;

    return {
      ids: ids,
      get primary() {
        return primary;
      },
      set primary(id) {
        primary = id;
      },
      clear: function () {
        ids.clear();
        primary = null;
      },
      setSingle: function (id) {
        ids.clear();
        if (id != null) ids.add(id);
        primary = id;
      },
      /** Replace selection with many ids; primary defaults to first in list. */
      setMany: function (idList, primaryId) {
        ids.clear();
        if (Array.isArray(idList)) {
          idList.forEach(function (x) {
            if (x != null) ids.add(String(x));
          });
        }
        primary = primaryId != null ? String(primaryId) : idList && idList[0] != null ? String(idList[0]) : null;
      },
      /** Shift-style toggle: add/remove one id; primary becomes toggled id if added. */
      toggle: function (id, multi) {
        var sid = String(id);
        if (!multi) {
          ids.clear();
          ids.add(sid);
          primary = sid;
          return;
        }
        if (ids.has(sid)) {
          ids.delete(sid);
          if (primary === sid) primary = ids.size ? Array.from(ids)[0] : null;
        } else {
          ids.add(sid);
          primary = sid;
        }
      },
      has: function (id) {
        return ids.has(String(id));
      },
      count: function () {
        return ids.size;
      },
      toArray: function () {
        return Array.from(ids);
      },
    };
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.selection = {
    create: createSelection,
  };
})(typeof window !== 'undefined' ? window : this);

/**
 * Rocco Forte demo — sessionStorage booking state between date + hotel steps.
 */
(function roccoForteBookingState(global) {
  'use strict';

  var STORAGE_KEY = 'roccoForteBookingState';

  function save(state) {
    try {
      global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  function load() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function formatDisplayRange(checkIn, checkOut) {
    if (!checkIn || !checkOut) return '';
    function fmt(iso) {
      var p = String(iso).split('-');
      if (p.length !== 3) return iso;
      return p[1] + '/' + p[2] + '/' + p[0];
    }
    return fmt(checkIn) + ' - ' + fmt(checkOut);
  }

  global.RoccoForteBookingState = {
    save: save,
    load: load,
    formatDisplayRange: formatDisplayRange,
  };
})(typeof window !== 'undefined' ? window : globalThis);

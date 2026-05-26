/**
 * Firebase Web SDK config for AEP Orchestration Lab (public client values).
 * Project: aep-orchestration-lab — App "AEP Lab Web".
 *
 * ---------------------------------------------------------------------------
 * Firebase Console — when migrating to a new Firebase project
 * ---------------------------------------------------------------------------
 * Replace the object below with the Web App snippet from Firebase Console
 * (Project settings → Your apps → SDK setup). `databaseURL` must match
 * Realtime Database in the **target** project (Build → Realtime Database).
 *
 * Optional: inject `window.__FIREBASE_CONFIG__` **before** this script in HTML
 * (e.g. one inline assignment from your templating layer). Properties on the
 * injected object **override** the defaults below without editing this file.
 * Do not put private keys here — only public Web config fields.
 * ---------------------------------------------------------------------------
 */
(function () {
  var defaults = {
    apiKey: 'AIzaSyC2idp0qt2TqHRWPBvRioPNzSjJGkZXkPY',
    authDomain: 'aep-orchestration-lab.firebaseapp.com',
    databaseURL: 'https://aep-orchestration-lab-default-rtdb.firebaseio.com',
    projectId: 'aep-orchestration-lab',
    storageBucket: 'aep-orchestration-lab.firebasestorage.app',
    messagingSenderId: '109406613852',
    appId: '1:109406613852:web:bff072dafe0250e87e5199',
  };
  var overlay =
    typeof window !== 'undefined' &&
    window.__FIREBASE_CONFIG__ &&
    typeof window.__FIREBASE_CONFIG__ === 'object'
      ? window.__FIREBASE_CONFIG__
      : {};
  window.firebaseDatabaseConfig = Object.assign({}, defaults, overlay);
})();

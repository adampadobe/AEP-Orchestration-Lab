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
 *
 * Sandbox host `adbe-gcp0819.web.app` auto-selects project `adbe-gcp0819`.
 * Register a Web app in that Firebase project and paste `apiKey`, `appId`, and
 * `messagingSenderId` into `sandboxDefaults` below (or inject via
 * `window.__FIREBASE_CONFIG__`). See docs/FIREBASE_MULTI_PROJECT_DEPLOY.md.
 * ---------------------------------------------------------------------------
 */
(function () {
  var productionDefaults = {
    apiKey: 'AIzaSyC2idp0qt2TqHRWPBvRioPNzSjJGkZXkPY',
    authDomain: 'aep-orchestration-lab.firebaseapp.com',
    databaseURL: 'https://aep-orchestration-lab-default-rtdb.firebaseio.com',
    projectId: 'aep-orchestration-lab',
    storageBucket: 'aep-orchestration-lab.firebasestorage.app',
    messagingSenderId: '109406613852',
    appId: '1:109406613852:web:bff072dafe0250e87e5199',
  };

  /** Public Web SDK fields for Firebase project adbe-gcp0819 (sandbox Hosting). */
  var sandboxDefaults = {
    apiKey: 'AIzaSyBDUxirvFFmbBJhuYeNURpfO7uSMO8BGNE',
    authDomain: 'adbe-gcp0819.firebaseapp.com',
    databaseURL: 'https://adbe-gcp0819-default-rtdb.firebaseio.com',
    projectId: 'adbe-gcp0819',
    storageBucket: 'adbe-gcp0819.firebasestorage.app',
    messagingSenderId: '82276930773',
    appId: '1:82276930773:web:de4b50ac0a72111ee13e5c',
  };

  function isSandboxHostingHostname(hostname) {
    var h = String(hostname || '').toLowerCase();
    return h === 'adbe-gcp0819.web.app' || h.endsWith('.adbe-gcp0819.web.app');
  }

  function pickProductionOrSandboxDefaults() {
    try {
      if (typeof location !== 'undefined' && isSandboxHostingHostname(location.hostname)) {
        return Object.assign({}, productionDefaults, sandboxDefaults);
      }
    } catch (_loc) {}
    return productionDefaults;
  }

  var defaults = pickProductionOrSandboxDefaults();
  var overlay =
    typeof window !== 'undefined' &&
    window.__FIREBASE_CONFIG__ &&
    typeof window.__FIREBASE_CONFIG__ === 'object'
      ? window.__FIREBASE_CONFIG__
      : {};
  window.firebaseDatabaseConfig = Object.assign({}, defaults, overlay);

  window.firebaseDatabaseConfigIsComplete = function firebaseDatabaseConfigIsComplete() {
    var c = window.firebaseDatabaseConfig;
    return !!(
      c &&
      String(c.apiKey || '').trim() &&
      String(c.appId || '').trim() &&
      String(c.messagingSenderId || '').trim()
    );
  };

  try {
    if (
      typeof location !== 'undefined' &&
      isSandboxHostingHostname(location.hostname) &&
      String(window.firebaseDatabaseConfig.projectId || '') === 'adbe-gcp0819' &&
      !window.firebaseDatabaseConfigIsComplete()
    ) {
      console.warn(
        '[sandbox] firebase-database-config: set apiKey (and appId/messagingSenderId) from Firebase Console → adbe-gcp0819 → Project settings → Your apps → Web, or assign window.__FIREBASE_CONFIG__ before this script.',
      );
    }
  } catch (_warn) {}
})();

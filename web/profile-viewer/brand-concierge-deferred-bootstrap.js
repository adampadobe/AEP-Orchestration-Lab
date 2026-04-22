/**
 * Loads Brand Concierge main.js early but only bootstraps into #brand-concierge-mount when
 * window.aepBcBootstrapWhenReady(callback) runs (e.g. logo click). Requires styleConfigurations.js + Launch Alloy.
 */
(function installBrandConciergeDeferredBootstrap() {
  var MAIN_JS =
    "https://experience-stage.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js";

  function ensureMainJs() {
    if (window.__brandConciergeMainJsLoading) return;
    window.__brandConciergeMainJsLoading = true;

    var existing = document.querySelector("script[data-brand-concierge-main='1']");
    if (existing) return;

    var s = document.createElement("script");
    s.async = true;
    s.dataset.brandConciergeMain = "1";
    s.src = MAIN_JS;
    s.onerror = function () {
      console.warn("Brand Concierge: failed to load main.js:", MAIN_JS);
    };
    document.head.appendChild(s);
  }

  function conciergeReady() {
    return !!(
      window.adobe &&
      window.adobe.concierge &&
      typeof window.adobe.concierge.bootstrap === "function"
    );
  }

  function alloyReady() {
    return typeof window.alloy === "function";
  }

  function bootstrapOnce() {
    if (window.__brandConciergeBootstrapped) return;
    if (!conciergeReady() || !alloyReady()) return;

    window.__brandConciergeBootstrapped = true;

    try {
      window.adobe.concierge.bootstrap({
        instanceName: "alloy",
        stylingConfigurations: window.styleConfiguration,
        selector: "#brand-concierge-mount",
        stickySession: false,
      });
    } catch (e) {
      console.warn("Brand Concierge: bootstrap threw.", e);
    }
  }

  /** Load remote agent script only (no bootstrap until first open). */
  ensureMainJs();

  /**
   * Run bootstrap once Alloy + concierge are ready; then invoke onDone(ok).
   * If already bootstrapped, calls onDone(true) synchronously.
   */
  window.aepBcBootstrapWhenReady = function (onDone) {
    ensureMainJs();

    if (window.__brandConciergeBootstrapped) {
      if (typeof onDone === "function") onDone(true);
      return;
    }

    var maxWaitMs = 30000;
    var start = Date.now();

    function tick() {
      if (Date.now() - start > maxWaitMs) {
        console.warn(
          "Brand Concierge: bootstrap timed out after " +
            maxWaitMs +
            "ms. alloy=" +
            alloyReady() +
            ", concierge=" +
            conciergeReady()
        );
        if (typeof onDone === "function") onDone(false);
        return;
      }

      bootstrapOnce();
      if (window.__brandConciergeBootstrapped) {
        if (typeof onDone === "function") onDone(true);
        return;
      }

      setTimeout(tick, 50);
    }

    tick();
  };
})();

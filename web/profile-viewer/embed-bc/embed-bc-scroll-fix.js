/**
 * Keep BC results visible: prevent focus on the input from scrolling the
 * page/modal down to the prompt bar, and snap the chat history to its true
 * bottom whenever BC reveals a new turn — same behaviour as any normal chat
 * UI (newest reply fully visible, input bar stays put, older turns scroll up
 * out of view). A previous version here only nudged the view just far enough
 * to bring the triggering element's edge into range. Because .input-section
 * is `position: sticky; bottom: 0` (see embed-bc-scroll-fix.css /
 * embed-bc-popup.css / brand-concierge-bottom-dock.css), a partial nudge can
 * leave scrollTop short of the true max — at that scroll position the sticky
 * bar's "stuck" render is visually pinned over the tail of the very message
 * it was supposed to reveal, exactly the "can't see the full response" bug
 * reported live. Scrolling to the container's actual scrollHeight removes
 * that ambiguity: once scrollTop is at (or past) the max, the sticky bar's
 * stuck position and its normal-flow position are the same place, so it can
 * never overlap the content above it.
 */
(function () {
  // Every real BC mount point (site-clone-bc.js mounts Adobe's bundle into
  // whichever of these matches the active display mode) — not just Modal's
  // #brand-concierge-mount, or this redirect silently never engages in
  // Centre bottom / Modal bar mode.
  var MOUNT =
    '#brand-concierge-mount, #bcBottomDockMount, #bcModalBarMount, #siteCloneBcModalMount, #siteCloneBcFrameMount';

  function getChatHistory(mount) {
    if (!mount) return null;
    return mount.querySelector('.brand-concierge-container');
  }

  function scrollWithinHistory(history, behavior) {
    if (!history) return;
    history.scrollTo({ top: history.scrollHeight, behavior: behavior || 'auto' });
  }

  function patchScrollIntoView() {
    if (Element.prototype.__embedBcScrollPatched) return;
    var native = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg) {
      var mount = this.closest && this.closest(MOUNT);
      if (!mount) return native.apply(this, arguments);
      var history =
        this.closest('.brand-concierge-container') || getChatHistory(mount);
      if (history && history.contains(this)) {
        var behavior =
          typeof arg === 'object' && arg ? arg.behavior : arg === false ? 'auto' : 'smooth';
        scrollWithinHistory(history, behavior);
        return;
      }
      return native.apply(this, arguments);
    };
    Element.prototype.__embedBcScrollPatched = true;
  }

  function patchFocus() {
    if (HTMLElement.prototype.__embedBcFocusPatched) return;
    var native = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (opts) {
      if (this.closest && this.closest(MOUNT)) {
        var isInput =
          this.matches &&
          (this.matches('textarea, input, [contenteditable="true"]') ||
            this.closest('.input-container, .input-section, .input-bar'));
        if (isInput) {
          var merged = Object.assign({}, opts || {}, { preventScroll: true });
          return native.call(this, merged);
        }
      }
      return native.call(this, opts);
    };
    HTMLElement.prototype.__embedBcFocusPatched = true;
  }

  /*
   * Belt-and-braces: don't rely solely on BC's own code calling
   * scrollIntoView() for every new turn — the Gemini override's fake-
   * streamed delivery (embed-bc-gemini-override.js) may not trigger the
   * same internal call real BC does. Watch each mount's chat history
   * directly and snap to bottom whenever its content changes, so a new
   * response is always fully visible with the input bar right below it,
   * regardless of what triggered the DOM update.
   */
  var observedHistories = typeof WeakSet === 'function' ? new WeakSet() : null;

  function observeHistory(history) {
    if (!history || (observedHistories && observedHistories.has(history))) return;
    if (observedHistories) observedHistories.add(history);
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || window.setTimeout)(function () {
        scheduled = false;
        scrollWithinHistory(history, 'smooth');
      });
    });
    observer.observe(history, { childList: true, subtree: true });
  }

  function ensureHistoryObservers() {
    document.querySelectorAll(MOUNT).forEach(function (mount) {
      observeHistory(getChatHistory(mount));
    });
  }

  patchScrollIntoView();
  patchFocus();
  ensureHistoryObservers();
  setInterval(ensureHistoryObservers, 1000);
})();

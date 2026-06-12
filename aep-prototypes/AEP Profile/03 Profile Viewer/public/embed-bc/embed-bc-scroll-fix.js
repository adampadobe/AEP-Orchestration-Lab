/**
 * Keep BC results visible: prevent focus on the input from scrolling the
 * page/modal down to the prompt bar. Do not reposition chat history after
 * replies — that leaves a large empty gap above the input.
 */
(function () {
  var MOUNT = '#brand-concierge-mount';

  function getChatHistory(mount) {
    if (!mount) return null;
    return mount.querySelector('.brand-concierge-container');
  }

  function scrollWithinHistory(history, el, behavior) {
    if (!history || !el) return;
    var pad = 12;
    var cr = history.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    if (er.bottom > cr.bottom - pad) {
      history.scrollTo({
        top: history.scrollTop + (er.bottom - cr.bottom) + pad,
        behavior: behavior || 'auto',
      });
    } else if (er.top < cr.top + pad) {
      history.scrollTo({
        top: history.scrollTop + (er.top - cr.top) - pad,
        behavior: behavior || 'auto',
      });
    }
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
        scrollWithinHistory(history, this, behavior);
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

  patchScrollIntoView();
  patchFocus();
})();

(function (root) {
  'use strict';

  function createApprovalPanel(options) {
    var els = options.elements;
    var sequence = 0;
    var loaded = null;
    var busy = false;
    var timer;
    var clock = options.clock || function () { return performance.now(); };
    var schedule = options.schedule || setTimeout;
    var cancel = options.cancel || clearTimeout;

    function message(text, error) {
      els.message.textContent = text;
      els.message.setAttribute('data-tone', error ? 'error' : 'info');
      els.message.hidden = !text;
    }

    function eligible() {
      return loaded && loaded.preview.state === 'previewed' &&
        clock() < loaded.deadline && options.isCurrent(loaded.context);
    }

    function render() {
      els.load.disabled = busy;
      els.confirm.disabled = busy || !eligible();
      els.approve.disabled = busy || !eligible() || !els.confirm.checked;
    }

    function clearReview() {
      cancel(timer);
      loaded = null;
      els.confirm.checked = false;
      els.review.hidden = true;
      els.details.textContent = '';
    }

    function reset() {
      sequence += 1;
      busy = false;
      clearReview();
      els.id.value = '';
      message('');
      render();
    }

    function loadPreviewFromLink(previewId, targetSandbox) {
      els.id.value = String(previewId || '').trim();
      var expectedSandbox = String(targetSandbox || '').trim().toLowerCase();
      var context = options.context();
      if (expectedSandbox && context.sandbox !== expectedSandbox) {
        clearReview();
        message('This preview link targets sandbox ' + expectedSandbox +
          '. Select that sandbox before reviewing the preview.', true);
        render();
        return Promise.resolve();
      }
      return load();
    }

    async function load() {
      var id = els.id.value.trim().toLowerCase();
      var seq = ++sequence;
      clearReview();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        message('Enter the preview UUID returned by the MCP.', true);
        render();
        return;
      }
      var context = options.context();
      var started = clock();
      busy = true;
      message('Loading the server-held preview...');
      render();
      try {
        var preview = await options.request('change_get', id, context);
        if (seq !== sequence || !options.isCurrent(context)) return;
        if (preview.preview_id !== id) throw new Error('Server returned a different preview. Nothing was approved.');
        var remaining = Date.parse(preview.expiresAt) - Date.parse(preview.serverNow);
        if (!Number.isFinite(remaining) || started + remaining <= clock()) throw new Error('Preview expired. Request a new preview.');
        loaded = {preview: preview, context: context, deadline: started + remaining};
        els.details.textContent = JSON.stringify({
          preview_id: preview.preview_id, sandbox: context.sandbox,
          context: preview.context, state: preview.state, operation: preview.operation,
          targets: preview.targets, sql: preview.sql, bindings: preview.bindings,
          expiresAt: preview.expiresAt, warning: preview.warning,
        }, null, 2);
        els.review.hidden = false;
        message(preview.state === 'previewed' ?
          'Review the exact target, SQL and bound values. Approval does not execute this change.' :
          'Preview state: ' + preview.state + '. It cannot be approved again here.');
        timer = schedule(function () {
          if (seq !== sequence) return;
          clearReview();
          message('Preview expired. Request and review a new preview.', true);
          render();
        }, Math.max(0, loaded.deadline - clock()));
      } catch (error) {
        if (seq === sequence && options.isCurrent(context)) message(error.message, true);
      } finally {
        if (seq === sequence) { busy = false; render(); }
      }
    }

    async function approve() {
      if (busy || !eligible() || !els.confirm.checked) { render(); return; }
      var selected = loaded;
      var seq = ++sequence;
      clearReview();
      busy = true;
      message('Recording approval. Do not retry if the outcome is uncertain.');
      render();
      try {
        var result = await options.request('change_approve', selected.preview.preview_id, selected.context);
        if (seq !== sequence || !options.isCurrent(selected.context)) return;
        if (!result.approved) throw new Error('Approval was not confirmed.');
        message('Approval recorded for ' + selected.preview.preview_id +
          '. Nothing was executed. Return to the MCP to apply this exact preview before it expires.');
      } catch (error) {
        if (seq === sequence && options.isCurrent(selected.context)) {
          message(error.message + ' Approval may have been recorded. Load the preview to inspect its state; do not blindly retry.', true);
        }
      } finally {
        if (seq === sequence) { busy = false; render(); }
      }
    }

    els.id.addEventListener('input', function () {
      sequence += 1;
      busy = false;
      clearReview();
      message('');
      render();
    });
    els.load.addEventListener('click', load);
    els.confirm.addEventListener('change', render);
    els.approve.addEventListener('click', approve);
    reset();
    return {reset: reset, loadPreviewFromLink: loadPreviewFromLink};
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {createApprovalPanel: createApprovalPanel};
  else root.SnowflakeWorkspaceApproval = {createApprovalPanel: createApprovalPanel};
})(typeof window !== 'undefined' ? window : globalThis);

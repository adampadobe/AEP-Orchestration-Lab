/**
 * "Add from screenshot/notes" — an always-visible composer on the Command
 * Centre home page: type an update and/or attach a screenshot (deal board,
 * email, meeting invite), and Gemini (functions/homeCommandExtractWork.js)
 * turns it into Command Centre customers/tasks/meetings, added directly via
 * the existing per-user save path (window.HomeCommandData) — no new
 * persistence layer.
 */
(function (global) {
  'use strict';

  var pendingImage = null; // { base64, mimeType }

  function $(id) {
    return document.getElementById(id);
  }

  function getAuthHeaders() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders();
    }
    return Promise.resolve({});
  }

  function setStatus(text, kind) {
    var el = $('ccComposerStatus');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = 'cc-composer__status' + (kind ? ' cc-composer__status--' + kind : '');
  }

  function showAttachment(dataUrl) {
    var wrap = $('ccComposerAttachment');
    var img = $('ccComposerAttachmentImg');
    if (img) img.src = dataUrl;
    if (wrap) wrap.hidden = false;
  }

  function clearAttachment() {
    pendingImage = null;
    var wrap = $('ccComposerAttachment');
    var img = $('ccComposerAttachmentImg');
    var fileInput = $('ccComposerFileInput');
    if (wrap) wrap.hidden = true;
    if (img) img.src = '';
    if (fileInput) fileInput.value = '';
  }

  function readFileAsImage(file) {
    if (!file || file.type.indexOf('image/') !== 0) return;
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || '');
      var match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) return;
      pendingImage = { base64: match[2], mimeType: match[1] };
      showAttachment(dataUrl);
      setStatus('', null);
    };
    reader.readAsDataURL(file);
  }

  function findExistingCustomer(customers, name) {
    var needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      customers.find(function (row) {
        return String(row.name || '').trim().toLowerCase() === needle;
      }) || null
    );
  }

  function mergeExtractedIntoState(extracted) {
    var data = global.HomeCommandData;
    if (!data) return { customers: 0, tasks: 0, meetings: 0, updated: 0 };
    var counts = { customers: 0, tasks: 0, meetings: 0, updated: 0 };

    (extracted.customers || []).forEach(function (c) {
      if (!c.name) return;
      var customersApi = data.useCustomers();
      var existing = findExistingCustomer(customersApi.getAll(), c.name);
      if (existing) {
        var patch = {};
        if (c.status) patch.status = c.status;
        if (c.nextAction) patch.nextAction = c.nextAction;
        if (c.eta) patch.eta = c.eta;
        if (c.drLink) patch.drLink = c.drLink;
        if (c.notes) {
          patch.notes = existing.notes ? existing.notes + '\n' + c.notes : c.notes;
        }
        customersApi.update(existing.id, patch);
        counts.updated++;
      } else {
        customersApi.add({
          name: c.name,
          notes: c.notes || '',
          drLink: c.drLink || '',
          status: c.status || 'Discovery',
          nextAction: c.nextAction || '',
          eta: c.eta || '',
        });
        counts.customers++;
      }
    });

    (extracted.tasks || []).forEach(function (t) {
      if (!t.title) return;
      data.useTasks().add({
        title: t.title,
        customerName: t.customerName || '',
        due: t.due || '',
      });
      counts.tasks++;
    });

    (extracted.meetings || []).forEach(function (m) {
      if (!m.title) return;
      data.useCalendar().add({
        title: m.title,
        customerName: m.customerName || '',
        at: m.at || '',
        context: m.context || '',
        tags: [],
      });
      counts.meetings++;
    });

    return counts;
  }

  function submitComposer() {
    var textEl = $('ccComposerText');
    var text = textEl ? String(textEl.value || '').trim() : '';
    if (!text && !pendingImage) {
      setStatus('Type an update or attach a screenshot first.', 'error');
      return;
    }

    setStatus('Extracting with Gemini…', 'busy');
    var submitBtn = $('ccComposerSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;

    getAuthHeaders()
      .then(function (headers) {
        var payload = { text: text };
        if (pendingImage) {
          payload.imageBase64 = pendingImage.base64;
          payload.imageMimeType = pendingImage.mimeType;
        }
        return fetch('/api/home-command/extract-work', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Extraction failed');
          return data;
        });
      })
      .then(function (data) {
        var counts = mergeExtractedIntoState(data);
        var total = counts.customers + counts.tasks + counts.meetings + counts.updated;
        if (!total) {
          setStatus("Didn't find anything to add — try a clearer screenshot or add a note.", 'error');
          return;
        }
        if (global.HomeCommandCentre && typeof global.HomeCommandCentre.renderAll === 'function') {
          global.HomeCommandCentre.renderAll();
        }
        setStatus(
          'Saved — ' +
            [
              counts.customers ? 'added ' + counts.customers + ' customer' + (counts.customers === 1 ? '' : 's') : '',
              counts.updated ? 'updated ' + counts.updated + ' customer' + (counts.updated === 1 ? '' : 's') : '',
              counts.tasks ? counts.tasks + ' task' + (counts.tasks === 1 ? '' : 's') : '',
              counts.meetings ? counts.meetings + ' meeting' + (counts.meetings === 1 ? '' : 's') : '',
            ]
              .filter(Boolean)
              .join(', ') +
            '.',
          'ok',
        );
        if (textEl) textEl.value = '';
        updateCount();
        clearAttachment();
      })
      .catch(function (err) {
        console.warn('[home-command-extract] extraction failed', err);
        setStatus('Extraction failed — try again.', 'error');
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function updateCount() {
    var textEl = $('ccComposerText');
    var countEl = $('ccComposerCount');
    if (!textEl || !countEl) return;
    countEl.textContent = String(textEl.value.length) + ' / 8,000';
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;

    var textEl = $('ccComposerText');
    if (textEl) {
      textEl.addEventListener('input', updateCount);
      textEl.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            readFileAsImage(items[i].getAsFile());
            e.preventDefault();
            return;
          }
        }
      });
      textEl.addEventListener('dragover', function (e) {
        e.preventDefault();
      });
      textEl.addEventListener('drop', function (e) {
        e.preventDefault();
        var files = (e.dataTransfer && e.dataTransfer.files) || [];
        if (files[0]) readFileAsImage(files[0]);
      });
      updateCount();
    }

    var attachBtn = $('ccComposerAttachBtn');
    var fileInput = $('ccComposerFileInput');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) readFileAsImage(fileInput.files[0]);
      });
    }

    var removeBtn = $('ccComposerAttachmentRemove');
    if (removeBtn) removeBtn.addEventListener('click', clearAttachment);

    var submitBtn = $('ccComposerSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitComposer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindOnce);
  } else {
    bindOnce();
  }
})(typeof window !== 'undefined' ? window : this);

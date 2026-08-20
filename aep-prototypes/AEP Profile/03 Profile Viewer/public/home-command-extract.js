/**
 * "Add from screenshot/notes" — lets an SC paste a screenshot (deal board,
 * email, meeting invite) and/or free text (deal request ID, notes, a brief)
 * and have Gemini (functions/homeCommandExtractWork.js) turn it into
 * Command Centre customers/tasks/meetings, added directly via the existing
 * per-user save path (window.HomeCommandData) — no new persistence layer.
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
    var el = $('ccExtractStatus');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = 'cc-extract-status' + (kind ? ' cc-extract-status--' + kind : '');
  }

  function showPreview(dataUrl) {
    var img = $('ccExtractPreviewImg');
    var label = $('ccExtractDropzoneLabel');
    var removeBtn = $('ccExtractRemoveImageBtn');
    if (img) {
      img.src = dataUrl;
      img.hidden = false;
    }
    if (label) label.hidden = true;
    if (removeBtn) removeBtn.hidden = false;
  }

  function clearImage() {
    pendingImage = null;
    var img = $('ccExtractPreviewImg');
    var label = $('ccExtractDropzoneLabel');
    var removeBtn = $('ccExtractRemoveImageBtn');
    var fileInput = $('ccExtractFileInput');
    if (img) {
      img.hidden = true;
      img.src = '';
    }
    if (label) label.hidden = false;
    if (removeBtn) removeBtn.hidden = true;
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
      showPreview(dataUrl);
      setStatus('', null);
    };
    reader.readAsDataURL(file);
  }

  function openModal() {
    var modal = $('ccExtractWorkModal');
    if (!modal) return;
    clearImage();
    var textEl = $('ccExtractText');
    if (textEl) textEl.value = '';
    setStatus('', null);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('cc-modal-backdrop--open');
  }

  function closeModal() {
    var modal = $('ccExtractWorkModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('cc-modal-backdrop--open');
  }

  function mergeExtractedIntoState(extracted) {
    var data = global.HomeCommandData;
    if (!data) return { customers: 0, tasks: 0, meetings: 0 };
    var counts = { customers: 0, tasks: 0, meetings: 0 };

    (extracted.customers || []).forEach(function (c) {
      if (!c.name) return;
      data.useCustomers().add({
        name: c.name,
        notes: c.notes || '',
        drLink: c.drLink || '',
        status: c.status || 'Discovery',
        nextAction: c.nextAction || '',
        eta: c.eta || '',
      });
      counts.customers++;
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

  function submitExtraction() {
    var textEl = $('ccExtractText');
    var text = textEl ? String(textEl.value || '').trim() : '';
    if (!text && !pendingImage) {
      setStatus('Paste a screenshot or add some notes first.', 'error');
      return;
    }

    setStatus('Extracting with Gemini…', 'busy');
    var submitBtn = $('ccExtractSubmitBtn');
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
        var total = counts.customers + counts.tasks + counts.meetings;
        if (!total) {
          setStatus("Didn't find anything to add — try a clearer screenshot or add a note.", 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (global.HomeCommandCentre && typeof global.HomeCommandCentre.renderAll === 'function') {
          global.HomeCommandCentre.renderAll();
        }
        setStatus(
          'Added ' +
            [
              counts.customers ? counts.customers + ' customer' + (counts.customers === 1 ? '' : 's') : '',
              counts.tasks ? counts.tasks + ' task' + (counts.tasks === 1 ? '' : 's') : '',
              counts.meetings ? counts.meetings + ' meeting' + (counts.meetings === 1 ? '' : 's') : '',
            ]
              .filter(Boolean)
              .join(', ') +
            '.',
          'ok',
        );
        setTimeout(closeModal, 1200);
      })
      .catch(function (err) {
        console.warn('[home-command-extract] extraction failed', err);
        setStatus('Extraction failed — try again.', 'error');
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;

    var openBtn = $('ccExtractWorkBtn');
    if (openBtn) openBtn.addEventListener('click', openModal);

    var openBannerBtn = $('ccExtractWorkBannerBtn');
    if (openBannerBtn) openBannerBtn.addEventListener('click', openModal);

    var closeBtn = $('ccExtractWorkModalClose');
    var cancelBtn = $('ccExtractWorkModalCancel');
    [closeBtn, cancelBtn].forEach(function (el) {
      if (el) el.addEventListener('click', closeModal);
    });

    var modal = $('ccExtractWorkModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }

    var submitBtn = $('ccExtractSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitExtraction);

    var removeBtn = $('ccExtractRemoveImageBtn');
    if (removeBtn) removeBtn.addEventListener('click', clearImage);

    var pickBtn = $('ccExtractPickBtn');
    var fileInput = $('ccExtractFileInput');
    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) readFileAsImage(fileInput.files[0]);
      });
    }

    var dropzone = $('ccExtractDropzone');
    if (dropzone) {
      dropzone.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            readFileAsImage(items[i].getAsFile());
            e.preventDefault();
            return;
          }
        }
      });
      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('cc-extract-dropzone--over');
      });
      dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('cc-extract-dropzone--over');
      });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('cc-extract-dropzone--over');
        var files = (e.dataTransfer && e.dataTransfer.files) || [];
        if (files[0]) readFileAsImage(files[0]);
      });
    }

    // Also catch a screenshot pasted anywhere in the modal, not just when the
    // dropzone itself has focus.
    document.addEventListener('paste', function (e) {
      var modalEl = $('ccExtractWorkModal');
      if (!modalEl || modalEl.hidden) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          readFileAsImage(items[i].getAsFile());
          e.preventDefault();
          return;
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindOnce);
  } else {
    bindOnce();
  }
})(typeof window !== 'undefined' ? window : this);

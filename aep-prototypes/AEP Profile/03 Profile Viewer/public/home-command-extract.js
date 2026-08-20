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
  var transcript = []; // { role: 'user'|'assistant', text, imageDataUrl, status }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderTranscript() {
    var el = $('ccComposerTranscript');
    if (!el) return;
    if (!transcript.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = transcript
      .map(function (m) {
        if (m.role === 'user') {
          return (
            '<div class="cc-chat-msg cc-chat-msg--user">' +
            (m.imageDataUrl ? '<img class="cc-chat-msg__thumb" src="' + m.imageDataUrl + '" alt="Attached screenshot">' : '') +
            (m.text ? '<div class="cc-chat-msg__text">' + escapeHtml(m.text) + '</div>' : '') +
            '</div>'
          );
        }
        return (
          '<div class="cc-chat-msg cc-chat-msg--assistant cc-chat-msg--' + (m.status || 'busy') + '">' +
          '<span class="cc-chat-msg__icon" aria-hidden="true">✨</span>' +
          '<div class="cc-chat-msg__text">' + escapeHtml(m.text) + '</div>' +
          '</div>'
        );
      })
      .join('');
    el.scrollTop = el.scrollHeight;
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
    if (!file || file.type.indexOf('image/') !== 0) {
      setStatus("That doesn't look like an image — try a screenshot or image file.", 'error');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || '');
      var match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) return;
      pendingImage = { base64: match[2], mimeType: match[1] };
      showAttachment(dataUrl);
      setStatus('', null);
    };
    reader.onerror = function () {
      setStatus('Could not read that file — try again.', 'error');
    };
    reader.readAsDataURL(file);
  }

  // Pull the first image out of a clipboard event, preferring the modern
  // `items` API but falling back to `files` for browsers (notably Safari in
  // some versions) that populate one but not the other.
  function imageFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    var items = clipboardData.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        return items[i].getAsFile();
      }
    }
    var files = clipboardData.files || [];
    for (var j = 0; j < files.length; j++) {
      if (files[j].type.indexOf('image/') === 0) return files[j];
    }
    return null;
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

  function setSubmitBusy(busy) {
    var submitBtn = $('ccComposerSubmitBtn');
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.innerHTML = busy
      ? '<span aria-hidden="true">✦</span> Reviewing…'
      : '<span aria-hidden="true">✦</span> Add to tracker';
  }

  function submitComposer() {
    var textEl = $('ccComposerText');
    var text = textEl ? String(textEl.value || '').trim() : '';
    if (!text && !pendingImage) {
      setStatus('Type an update or attach a screenshot first.', 'error');
      return;
    }

    // Send immediately, chat-style: the user's message (text + thumbnail)
    // appears in the transcript and the input clears right away, before the
    // network call even starts — the assistant's "reviewing" bubble is
    // updated in place once Gemini responds.
    var imagePayload = pendingImage;
    var userImageDataUrl = imagePayload ? 'data:' + imagePayload.mimeType + ';base64,' + imagePayload.base64 : '';
    transcript.push({ role: 'user', text: text, imageDataUrl: userImageDataUrl });
    var assistantMsg = { role: 'assistant', text: 'Reviewing…', status: 'busy' };
    transcript.push(assistantMsg);
    renderTranscript();

    setStatus('', null);
    setSubmitBusy(true);
    if (textEl) textEl.value = '';
    updateCount();
    clearAttachment();

    getAuthHeaders()
      .then(function (headers) {
        if (!headers || !headers.Authorization) {
          throw new Error('You need to be signed in to use this — try refreshing the page.');
        }
        var payload = { text: text };
        if (imagePayload) {
          payload.imageBase64 = imagePayload.base64;
          payload.imageMimeType = imagePayload.mimeType;
        }
        return fetch('/api/home-command/extract-work', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Extraction failed (' + res.status + ')');
          return data;
        });
      })
      .then(function (data) {
        var counts = mergeExtractedIntoState(data);
        var total = counts.customers + counts.tasks + counts.meetings + counts.updated;
        if (!total) {
          assistantMsg.text = "Didn't find anything to add — try a clearer screenshot or note.";
          assistantMsg.status = 'error';
          renderTranscript();
          return;
        }
        if (global.HomeCommandCentre && typeof global.HomeCommandCentre.renderAll === 'function') {
          global.HomeCommandCentre.renderAll();
        }
        assistantMsg.text =
          'Saved — ' +
          [
            counts.customers ? 'added ' + counts.customers + ' customer' + (counts.customers === 1 ? '' : 's') : '',
            counts.updated ? 'updated ' + counts.updated + ' customer' + (counts.updated === 1 ? '' : 's') : '',
            counts.tasks ? counts.tasks + ' task' + (counts.tasks === 1 ? '' : 's') : '',
            counts.meetings ? counts.meetings + ' meeting' + (counts.meetings === 1 ? '' : 's') : '',
          ]
            .filter(Boolean)
            .join(', ') +
          '.';
        assistantMsg.status = 'ok';
        renderTranscript();
      })
      .catch(function (err) {
        console.warn('[home-command-extract] extraction failed', err);
        assistantMsg.text = (err && err.message) || 'Extraction failed — try again.';
        assistantMsg.status = 'error';
        renderTranscript();
      })
      .finally(function () {
        setSubmitBusy(false);
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
      updateCount();
    }

    // A `paste` event always targets whatever currently has keyboard focus
    // (not wherever the mouse happens to be), so binding only to the
    // textarea means Cmd+V does nothing unless that exact field is focused.
    // Listen at the document level instead, gated on the composer being
    // open, so pasting a screenshot works regardless of focus.
    document.addEventListener('paste', function (e) {
      var composer = $('ccComposer');
      if (!composer || !composer.open) return;
      var image = imageFromClipboard(e.clipboardData);
      if (image) {
        readFileAsImage(image);
        e.preventDefault();
      }
    });

    var body = $('ccComposer');
    if (body) {
      body.addEventListener('dragover', function (e) {
        e.preventDefault();
      });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        var files = (e.dataTransfer && e.dataTransfer.files) || [];
        if (files[0]) readFileAsImage(files[0]);
      });
    }

    var fileInput = $('ccComposerFileInput');
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

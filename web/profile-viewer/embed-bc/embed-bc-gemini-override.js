/**
 * Embed BC: Gemini override.
 *
 * When window.SiteCloneBcConfig.isGeminiOverrideEnabled() is true (the
 * "Use Gemini (repeatable)" checkbox in the shared env bar's Brand
 * Concierge panel — see site-clone-bc-env.js / shared/demo-env-strip.js),
 * every turn is answered by our own Gemini-backed Cloud Function instead
 * of Adobe's real Brand Concierge model, so demo answers are 100%
 * repeatable regardless of Adobe's BC service/grounding. The real
 * conversation event is still sent to Edge in the background purely so
 * Adobe's own BC reporting (conversation count, unique users, sentiment
 * in the BC admin console) keeps reflecting real usage — its actual
 * answer content is discarded and never shown; only Gemini's answer
 * renders in the chat. See fireReportingOnlyEvent below.
 *
 * Same interception pattern as embed-bc-local-fallback.js /
 * embed-bc-local-engine.js (the existing British Army local-catalog
 * fallback): wrap window.alloy's 'sendConversationEvent' command and
 * feed a fabricated BC-shaped turn into payload.onStreamResponse, the
 * exact callback Adobe's own chat bundle already expects. Adobe's bundle
 * renders 100% of the DOM/typing/cards from that object — it cannot
 * tell the difference, so the widget looks and feels identical.
 *
 * Training data ("brain" for this demo) is provided by dragging CSV/text
 * files directly onto the page while this override is enabled — a
 * website list, a product list, and/or free-form notes — rather than a
 * separate upload panel. Files are classified by filename keywords
 * (falling back to content sniffing for a website URL list), merged
 * into a small per-sandbox+demo corpus, and used the next time a
 * question is asked.
 */
(function () {
  function isEnabled() {
    return !!(
      window.SiteCloneBcConfig &&
      typeof window.SiteCloneBcConfig.isGeminiOverrideEnabled === 'function' &&
      window.SiteCloneBcConfig.isGeminiOverrideEnabled()
    );
  }

  function demoPrefix() {
    return (window.envBarConfig && window.envBarConfig.prefix) || 'default';
  }

  function sandboxKey() {
    try {
      if (window.SiteCloneBcEnv && typeof window.SiteCloneBcEnv.getSandboxKey === 'function') {
        return window.SiteCloneBcEnv.getSandboxKey();
      }
    } catch (_e) {
      /* fall through */
    }
    return 'default';
  }

  function corpusStorageKey() {
    return 'bcGeminiCorpus:' + sandboxKey() + ':' + demoPrefix();
  }

  function loadCorpus() {
    try {
      var raw = window.localStorage.getItem(corpusStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          websiteUrls: Array.isArray(parsed.websiteUrls) ? parsed.websiteUrls : [],
          productNames: Array.isArray(parsed.productNames) ? parsed.productNames : [],
          manifestText: typeof parsed.manifestText === 'string' ? parsed.manifestText : '',
          trainedAt: parsed.trainedAt || null,
        };
      }
    } catch (_e) {
      /* corrupt/blocked storage — start fresh */
    }
    return { websiteUrls: [], productNames: [], manifestText: '', trainedAt: null };
  }

  var corpus = loadCorpus();

  function saveCorpus() {
    try {
      window.localStorage.setItem(corpusStorageKey(), JSON.stringify(corpus));
    } catch (_e) {
      /* storage unavailable — corpus still usable for this page session */
    }
  }

  function setStatus(text) {
    var el = document.getElementById('siteCloneBcGeminiOverrideStatus');
    if (el) el.textContent = text;
  }

  function refreshStatus() {
    if (!corpus.websiteUrls.length && !corpus.productNames.length && !corpus.manifestText) {
      setStatus('');
      return;
    }
    var bits = [];
    if (corpus.websiteUrls.length) bits.push(corpus.websiteUrls.length + ' site' + (corpus.websiteUrls.length === 1 ? '' : 's'));
    if (corpus.productNames.length) bits.push(corpus.productNames.length + ' product' + (corpus.productNames.length === 1 ? '' : 's'));
    if (corpus.manifestText) bits.push('notes');
    var trainedSuffix = corpus.trainedAt ? ' — trained' : ' — ask a question to train';
    setStatus('Gemini: ' + bits.join(', ') + trainedSuffix);
  }

  refreshStatus();

  // --- Drag & drop training-file ingestion --------------------------------

  function classifyFilename(name) {
    var n = String(name || '').toLowerCase();
    if (/product|sku|catalog|catalogue/.test(n)) return 'products';
    if (/manifest|note|faq/.test(n)) return 'manifest';
    if (/site|website|url|domain/.test(n)) return 'websites';
    return null;
  }

  function parseFirstColumnLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) {
        return line.split(',')[0].replace(/^["']|["']$/g, '').trim();
      })
      .filter(Boolean);
  }

  function isUrlish(line) {
    return /^https?:\/\//i.test(line) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(line);
  }

  function looksLikeUrlList(lines) {
    if (!lines.length) return false;
    var urlish = lines.filter(isUrlish);
    return urlish.length / lines.length > 0.6;
  }

  function mergeUnique(list, additions) {
    var seen = {};
    var out = [];
    list.concat(additions).forEach(function (v) {
      var key = String(v || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function ingestFileText(name, text) {
    var kind = classifyFilename(name);
    var lines = parseFirstColumnLines(text);
    if (!kind) kind = looksLikeUrlList(lines) ? 'websites' : 'manifest';

    if (kind === 'websites') {
      corpus.websiteUrls = mergeUnique(corpus.websiteUrls, lines.filter(isUrlish));
    } else if (kind === 'products') {
      corpus.productNames = mergeUnique(corpus.productNames, lines);
    } else {
      corpus.manifestText = (corpus.manifestText ? corpus.manifestText + '\n\n' : '') + String(text || '').slice(0, 20000);
    }
    corpus.trainedAt = null; // new data invalidates any prior training
    saveCorpus();
    refreshStatus();
  }

  function readFileAsText(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        resolve('');
      };
      reader.readAsText(file);
    });
  }

  /** Recursively walks a dropped directory entry, resolving to a flat list of File objects. */
  function collectFilesFromEntry(entry) {
    if (!entry) return Promise.resolve([]);
    if (entry.isFile) {
      return new Promise(function (resolve) {
        entry.file(
          function (file) {
            resolve([file]);
          },
          function () {
            resolve([]);
          },
        );
      });
    }
    if (entry.isDirectory) {
      var reader = entry.createReader();
      var allEntries = [];
      function readBatch() {
        return new Promise(function (resolve, reject) {
          reader.readEntries(resolve, reject);
        }).then(function (batch) {
          // readEntries() may not return everything in one call — keep going until empty.
          if (!batch || !batch.length) return allEntries;
          allEntries = allEntries.concat(batch);
          return readBatch();
        });
      }
      return readBatch()
        .then(function (entries) {
          return Promise.all(entries.map(collectFilesFromEntry));
        })
        .then(function (nested) {
          return nested.reduce(function (flat, files) {
            return flat.concat(files);
          }, []);
        })
        .catch(function () {
          return [];
        });
    }
    return Promise.resolve([]);
  }

  /** Supports dropping a folder (e.g. "QIA BC") as well as individual files — browsers only
   *  expose a folder's contents via the DataTransferItem.webkitGetAsEntry() directory-walk
   *  API, not the plain dataTransfer.files list. */
  function collectDroppedFiles(dt) {
    if (dt.items && dt.items.length && typeof dt.items[0].webkitGetAsEntry === 'function') {
      var entries = Array.prototype.map
        .call(dt.items, function (item) {
          return typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
        })
        .filter(Boolean);
      if (entries.length) {
        return Promise.all(entries.map(collectFilesFromEntry)).then(function (nested) {
          return nested.reduce(function (flat, files) {
            return flat.concat(files);
          }, []);
        });
      }
    }
    return Promise.resolve(dt.files ? Array.prototype.slice.call(dt.files) : []);
  }

  function handleDrop(ev) {
    if (!isEnabled()) return;
    var dt = ev.dataTransfer;
    if (!dt || (!dt.files || !dt.files.length) && !(dt.items && dt.items.length)) return;
    ev.preventDefault();
    ev.stopPropagation();
    collectDroppedFiles(dt).then(function (files) {
      files.forEach(function (file) {
        readFileAsText(file).then(function (text) {
          ingestFileText(file.name, text);
        });
      });
    });
  }

  function handleDragOver(ev) {
    if (!isEnabled()) return;
    var dt = ev.dataTransfer;
    if (dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') !== -1) {
      ev.preventDefault();
    }
  }

  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('drop', handleDrop, true);

  // --- File/folder picker button (more reliable than drag-and-drop over Adobe's chat
  // widget — browsers have inconsistent native handling of file drops landing directly on
  // a form input/textarea, which is exactly where BC's own chat box lives) ----------------

  var pickerButton = null;
  var pickerInput = null;

  function ensurePickerUi() {
    if (pickerButton) return;
    pickerButton = document.createElement('button');
    pickerButton.type = 'button';
    pickerButton.id = 'siteCloneBcGeminiPickerBtn';
    pickerButton.title = 'Train Gemini — choose a folder or files (websites CSV, products CSV, notes)';
    pickerButton.textContent = '➕ Train Gemini';
    pickerButton.style.cssText =
      'position:fixed;right:1rem;bottom:1rem;z-index:99999;padding:0.6rem 1rem;' +
      'border-radius:999px;border:1px solid rgba(0,0,0,0.15);background:#fff;color:#111;' +
      'font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.18);cursor:pointer;display:none;';

    pickerInput = document.createElement('input');
    pickerInput.type = 'file';
    pickerInput.multiple = true;
    pickerInput.webkitdirectory = true;
    pickerInput.directory = true;
    pickerInput.style.display = 'none';

    pickerButton.addEventListener('click', function () {
      pickerInput.click();
    });
    pickerInput.addEventListener('change', function () {
      var files = pickerInput.files ? Array.prototype.slice.call(pickerInput.files) : [];
      files.forEach(function (file) {
        readFileAsText(file).then(function (text) {
          ingestFileText(file.webkitRelativePath || file.name, text);
        });
      });
      pickerInput.value = '';
    });

    document.body.appendChild(pickerButton);
    document.body.appendChild(pickerInput);
  }

  function refreshPickerVisibility() {
    ensurePickerUi();
    pickerButton.style.display = isEnabled() ? 'block' : 'none';
  }

  refreshPickerVisibility();
  document.addEventListener('change', function (ev) {
    if (ev && ev.target && ev.target.id === 'siteCloneBcGeminiOverrideToggle') {
      refreshPickerVisibility();
    }
  });
  document.addEventListener('aep-demo-env-strip-mounted', refreshPickerVisibility);

  // --- Backend calls -------------------------------------------------------

  function ensureTrained() {
    if (corpus.trainedAt) return Promise.resolve(corpus);
    if (!corpus.websiteUrls.length && !corpus.productNames.length && !corpus.manifestText) {
      return Promise.resolve(corpus); // nothing dropped yet — Gemini answers generically
    }
    setStatus('Training Gemini…');
    return fetch('/api/bc-gemini-train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandbox: sandboxKey(),
        demoPrefix: demoPrefix(),
        websiteUrls: corpus.websiteUrls,
        productNames: corpus.productNames,
        manifestText: corpus.manifestText,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bc-gemini-train HTTP ' + res.status);
        return res.json();
      })
      .then(function () {
        corpus.trainedAt = Date.now();
        saveCorpus();
        refreshStatus();
        return corpus;
      })
      .catch(function (err) {
        console.warn('[embed-bc-gemini-override] training failed', err);
        setStatus('Gemini: training failed — answering from product/site list only');
        return corpus;
      });
  }

  function idsFromPayload(payload) {
    var conv = (payload && payload.xdm && payload.xdm.conversation) || (payload && payload.data && payload.data.conversation) || {};
    return {
      conversationId: conv.conversationID || conv.conversationId || 'gemini-conv-' + Date.now(),
      interactionId: conv.turnID || conv.turnId || conv.interactionId || 'gemini-turn-' + Date.now(),
    };
  }

  function extractUserText(payload) {
    try {
      return String(payload.xdm.conversation.prompt.raw[0].text || '');
    } catch (_e) {
      return '';
    }
  }

  /** Same card shape as ArmyBcLocalEngine.multimodalElements — renders identically. */
  function buildMultimodalElements(products) {
    var list = Array.isArray(products) ? products : [];
    var withImages = list.filter(function (p) {
      return p && p.productImageURL;
    });
    var cards = (withImages.length ? withImages : list).slice(0, 3);
    return {
      elements: cards.map(function (p) {
        return {
          entity_info: {
            productID: p.productID || p.productName,
            productName: p.productName,
            productDescription: p.productDescription || p.productName,
            productPageURL: p.productPageURL || '',
            productImageURL: p.productImageURL || '',
          },
        };
      }),
    };
  }

  function buildTurn(payload) {
    var text = extractUserText(payload);
    var ids = idsFromPayload(payload);
    return ensureTrained()
      .then(function () {
        return fetch('/api/bc-gemini-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sandbox: sandboxKey(),
            demoPrefix: demoPrefix(),
            message: text,
            conversationId: ids.conversationId,
          }),
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('bc-gemini-answer HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        return {
          conversationId: ids.conversationId,
          interactionId: ids.interactionId,
          request: { message: text, context: { application: 'gemini-override' } },
          response: {
            message:
              (data && data.message) ||
              'I don’t have that yet — drop a CSV of your sites or products onto this chat and ask me again.',
            sources: [],
            promptSuggestions: [],
            multimodalElements: buildMultimodalElements(data && data.products),
            widgets: [],
          },
          state: 'completed',
        };
      })
      .catch(function (err) {
        console.warn('[embed-bc-gemini-override] answer failed', err);
        return {
          conversationId: ids.conversationId,
          interactionId: ids.interactionId,
          request: { message: text, context: { application: 'gemini-override' } },
          response: {
            message: 'Something went wrong reaching the Gemini backend for this demo.',
            sources: [],
            promptSuggestions: [],
            multimodalElements: { elements: [] },
            widgets: [],
          },
          state: 'completed',
        };
      });
  }

  /** Fakes the token-reveal effect on an already-complete answer — same technique as ArmyBcLocalEngine.streamTurnToCallback. */
  function streamTurnToCallback(turn, streamCb) {
    if (typeof streamCb !== 'function') return Promise.resolve(turn);
    var reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var revealDelayMs = reduceMotion ? 0 : 220;
    return new Promise(function (resolve) {
      setTimeout(function () {
        streamCb({
          conversationId: turn.conversationId,
          interactionId: turn.interactionId,
          request: turn.request,
          state: 'completed',
          response: turn.response,
        });
        resolve(turn);
      }, revealDelayMs);
    });
  }

  function deliverGeminiTurn(payload) {
    var streamCb = payload && payload.onStreamResponse;
    return buildTurn(payload).then(function (turn) {
      if (typeof streamCb === 'function') return streamTurnToCallback(turn, streamCb);
      return turn;
    });
  }

  /**
   * Fire the REAL sendConversationEvent at Adobe/Edge in the background, purely so this
   * conversation still counts toward Adobe's own Brand Concierge reporting (conversations,
   * unique users, sentiment, etc. in the BC admin console) — but with onStreamResponse /
   * onFailureCallback stubbed out to no-ops, so whatever content Adobe's model returns is
   * discarded and never reaches the visible chat. Only the Gemini answer (delivered
   * separately via deliverGeminiTurn) is ever rendered. Never awaited / never allowed to
   * reject visibly — a failure here must not affect the demo.
   */
  function fireReportingOnlyEvent(realAlloyFn, payload) {
    if (typeof realAlloyFn !== 'function' || !payload) return;
    var reportingPayload = {};
    Object.keys(payload).forEach(function (k) {
      reportingPayload[k] = payload[k];
    });
    reportingPayload.onStreamResponse = function () {};
    reportingPayload.onFailureCallback = function () {};
    try {
      var result = realAlloyFn('sendConversationEvent', reportingPayload);
      if (result && typeof result.catch === 'function') {
        result.catch(function (err) {
          console.warn('[embed-bc-gemini-override] reporting-only Edge call failed (ignored)', err);
        });
      }
    } catch (err) {
      console.warn('[embed-bc-gemini-override] failed to fire reporting-only Edge call', err);
    }
  }

  function wrapAlloy(instanceName) {
    var name = instanceName || 'alloy';
    var alloyFn = window[name];
    if (!alloyFn || alloyFn.__embedBcGeminiWrapped) return;

    var wrapped = function (command) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (command !== 'sendConversationEvent' || !isEnabled()) {
        return alloyFn.apply(window, [command].concat(args));
      }
      // Keep sending the real event to Edge so Adobe's own BC reporting (conversation
      // count, unique users, sentiment) stays accurate — but never render its answer.
      fireReportingOnlyEvent(alloyFn, args[0]);
      return deliverGeminiTurn(args[0]);
    };
    Object.keys(alloyFn).forEach(function (k) {
      try {
        wrapped[k] = alloyFn[k];
      } catch (_e) {
        /* read-only */
      }
    });
    wrapped.__embedBcGeminiWrapped = true;
    window[name] = wrapped;
  }

  function patchBootstrap() {
    if (
      !window.adobe ||
      !window.adobe.concierge ||
      typeof window.adobe.concierge.bootstrap !== 'function' ||
      window.adobe.concierge.bootstrap.__embedBcGeminiPatched
    ) {
      return;
    }
    var orig = window.adobe.concierge.bootstrap.bind(window.adobe.concierge);
    window.adobe.concierge.bootstrap = function (config) {
      return orig(config).then(function (out) {
        wrapAlloy(config.instanceName || 'alloy');
        return out;
      });
    };
    window.adobe.concierge.bootstrap.__embedBcGeminiPatched = true;
  }

  function init() {
    patchBootstrap();
    wrapAlloy('alloy');
  }

  init();
  document.addEventListener('DOMContentLoaded', init);
})();

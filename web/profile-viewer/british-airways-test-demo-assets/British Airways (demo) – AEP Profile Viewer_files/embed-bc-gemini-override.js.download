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
 * Training data ("brain" for this demo) is provided via a "➕ Train LLM" button
 * inserted into the existing, stable Brand Concierge settings panel
 * (shared/brand-concierge-midrail-panel.js's display-mode popup — the same
 * panel regardless of which BC display mode, Full Screen/Modal/Injected/
 * Centre bottom/Modal bar, is active), which opens a folder/file picker —
 * a website list, a product list, and/or free-form notes. Dropping files
 * directly onto the page also still works as a secondary path. Files are
 * classified by filename keywords (falling back to content sniffing for a
 * website URL list), merged into a small per-sandbox+demo corpus, and
 * training starts immediately on upload rather than waiting for a question.
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

  function normaliseProductEntry(p) {
    // Accept a bare string (legacy "one name per line" shape) or a structured object.
    if (typeof p === 'string') return { productName: p };
    if (!p || typeof p !== 'object') return null;
    var out = {};
    if (p.productID) out.productID = String(p.productID).trim();
    if (p.productName) out.productName = String(p.productName).trim();
    if (p.productDescription) out.productDescription = String(p.productDescription).trim();
    if (p.productPageURL) out.productPageURL = String(p.productPageURL).trim();
    if (p.productImageURL) out.productImageURL = String(p.productImageURL).trim();
    return out.productName ? out : null;
  }

  function loadCorpus() {
    try {
      var raw = window.localStorage.getItem(corpusStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        // Migrate the old productNames:[string] shape transparently if present.
        var rawProducts = Array.isArray(parsed.products)
          ? parsed.products
          : Array.isArray(parsed.productNames)
            ? parsed.productNames
            : [];
        return {
          websiteUrls: Array.isArray(parsed.websiteUrls) ? parsed.websiteUrls : [],
          products: rawProducts.map(normaliseProductEntry).filter(Boolean),
          manifestText: typeof parsed.manifestText === 'string' ? parsed.manifestText : '',
          trainedAt: parsed.trainedAt || null,
        };
      }
    } catch (_e) {
      /* corrupt/blocked storage — start fresh */
    }
    return { websiteUrls: [], products: [], manifestText: '', trainedAt: null };
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
    if (!corpus.websiteUrls.length && !corpus.products.length && !corpus.manifestText) {
      setStatus('');
      return;
    }
    var bits = [];
    if (corpus.websiteUrls.length) bits.push(corpus.websiteUrls.length + ' site' + (corpus.websiteUrls.length === 1 ? '' : 's'));
    if (corpus.products.length) bits.push(corpus.products.length + ' product' + (corpus.products.length === 1 ? '' : 's'));
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

  /** Splits one CSV line into fields, honouring double-quoted fields containing commas. */
  function parseCsvLine(line) {
    var out = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(function (s) {
      return s.trim();
    });
  }

  function parseFirstColumnLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .filter(function (l) {
        return l.trim();
      })
      .map(function (line) {
        return parseCsvLine(line)[0] || '';
      })
      .filter(Boolean);
  }

  var PRODUCT_COLUMN_ALIASES = {
    productid: 'productID',
    id: 'productID',
    _id: 'productID',
    sku: 'productID',
    productname: 'productName',
    name: 'productName',
    title: 'productName',
    productdescription: 'productDescription',
    description: 'productDescription',
    productpageurl: 'productPageURL',
    pageurl: 'productPageURL',
    url: 'productPageURL',
    link: 'productPageURL',
    productimageurl: 'productImageURL',
    imageurl: 'productImageURL',
    image: 'productImageURL',
    imgurl: 'productImageURL',
  };

  /**
   * Parses a full product-catalog CSV (matching the sample-catalog.csv schema — productID,
   * _id, productName, productDescription, productPageURL, productImageURL, productRating)
   * into structured product objects, so page/image URLs the user already curated survive
   * all the way through to the answer instead of being discarded down to a bare name.
   * Returns null if this doesn't look like a header'd product CSV, so the caller can fall
   * back to treating it as one plain product name per line.
   */
  function parseProductsCsv(text) {
    var lines = String(text || '')
      .split(/\r?\n/)
      .filter(function (l) {
        return l.trim();
      });
    if (!lines.length) return null;
    var header = parseCsvLine(lines[0]).map(function (h) {
      return String(h || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
    });
    var mapped = header.map(function (h) {
      return PRODUCT_COLUMN_ALIASES[h] || null;
    });
    if (mapped.indexOf('productName') === -1) return null; // no recognisable header — not a structured CSV

    var products = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = parseCsvLine(lines[i]);
      var obj = {};
      for (var c = 0; c < mapped.length; c++) {
        if (mapped[c] && cols[c]) obj[mapped[c]] = cols[c];
      }
      var normalised = normaliseProductEntry(obj);
      if (normalised) products.push(normalised);
    }
    return products.length ? products : null;
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

  function mergeUniqueProducts(list, additions) {
    var seen = {};
    var out = [];
    list.concat(additions).forEach(function (p) {
      var key = String((p && p.productName) || '').trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(p);
    });
    return out;
  }

  function ingestFileText(name, text) {
    var kind = classifyFilename(name);
    var structuredProducts = kind === 'products' || !kind ? parseProductsCsv(text) : null;
    if (!kind) kind = structuredProducts ? 'products' : looksLikeUrlList(parseFirstColumnLines(text)) ? 'websites' : 'manifest';

    if (kind === 'websites') {
      corpus.websiteUrls = mergeUnique(corpus.websiteUrls, parseFirstColumnLines(text).filter(isUrlish));
    } else if (kind === 'products') {
      var products = structuredProducts || parseFirstColumnLines(text).map(function (n) {
        return { productName: n };
      });
      corpus.products = mergeUniqueProducts(corpus.products, products);
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
      if (files.length) showToast('Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…', 'busy');
      return Promise.all(
        files.map(function (file) {
          return readFileAsText(file).then(function (text) {
            ingestFileText(file.name, text);
          });
        }),
      ).then(function () {
        // Train immediately on upload rather than waiting for the first question, so
        // there's a clear, immediate "received → training → ready" signal to watch for.
        if (files.length) void ensureTrained();
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

  // --- File/folder picker button, inside the stable Brand Concierge settings panel --------
  //
  // Adobe's chat DOM (and even our own bcp-panel mode-toggle popup layout) differs across
  // display modes (Full Screen/Modal/Injected/Centre bottom/Modal bar), which made anchoring
  // a button to "the chat input" unreliable across all of them. The one thing that IS stable
  // regardless of display mode is our own Brand Concierge settings popup
  // (shared/brand-concierge-midrail-panel.js's "Switch how Brand Concierge appears..." panel,
  // opened via the sparkle trigger) — it's our own DOM, not Adobe's, and always renders the
  // same way. Insert a plain "Train LLM" button there once, instead of overlaying the chat.

  var pickerInput = null;
  var trainButtonInserted = false;

  function ensurePickerInput() {
    if (pickerInput) return;
    pickerInput = document.createElement('input');
    pickerInput.type = 'file';
    pickerInput.multiple = true;
    pickerInput.webkitdirectory = true;
    pickerInput.directory = true;
    pickerInput.style.display = 'none';
    pickerInput.addEventListener('change', function () {
      var files = pickerInput.files ? Array.prototype.slice.call(pickerInput.files) : [];
      if (files.length) showToast('Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…', 'busy');
      Promise.all(
        files.map(function (file) {
          return readFileAsText(file).then(function (text) {
            ingestFileText(file.webkitRelativePath || file.name, text);
          });
        }),
      ).then(function () {
        // Train immediately on upload rather than waiting for the first question, so
        // there's a clear, immediate "received → training → ready" signal to watch for.
        if (files.length) void ensureTrained();
      });
      pickerInput.value = '';
    });
    document.body.appendChild(pickerInput);
  }

  function tryInsertTrainButton() {
    if (trainButtonInserted) return true;
    var optionsMount = document.getElementById('bcpPanelModeOptions');
    if (!optionsMount) return false;
    ensurePickerInput();

    var row = document.createElement('div');
    row.id = 'bcpTrainLlmRow';
    row.style.cssText = 'margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(0,0,0,0.08);';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'siteCloneBcGeminiPickerBtn';
    btn.textContent = '➕ Train LLM';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:0.35rem;height:30px;padding:0 0.75rem;' +
      'border-radius:999px;border:1px solid rgba(0,0,0,0.15);background:#fff;color:#333;' +
      'font:600 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;';
    btn.addEventListener('click', function () {
      pickerInput.click();
    });

    row.appendChild(btn);
    optionsMount.parentNode.insertBefore(row, optionsMount.nextSibling);
    trainButtonInserted = true;
    return true;
  }

  function refreshTrainButtonVisibility() {
    var row = document.getElementById('bcpTrainLlmRow');
    if (!isEnabled()) {
      if (row) row.style.display = 'none';
      return;
    }
    if (!tryInsertTrainButton()) return; // panel not mounted yet — retried by the poll below
    document.getElementById('bcpTrainLlmRow').style.display = 'block';
  }

  // The midrail panel mounts lazily and asynchronously with no public "ready" event, so a
  // short bounded poll is the simplest reliable way to catch the moment it first appears —
  // once inserted, trainButtonInserted short-circuits all further work.
  var trainButtonPollAttempts = 0;
  var trainButtonPollInterval = setInterval(function () {
    trainButtonPollAttempts++;
    refreshTrainButtonVisibility();
    if (trainButtonInserted || trainButtonPollAttempts > 40) {
      clearInterval(trainButtonPollInterval);
    }
  }, 500);

  refreshTrainButtonVisibility();
  document.addEventListener('change', function (ev) {
    if (ev && ev.target && ev.target.id === 'siteCloneBcGeminiOverrideToggle') {
      refreshTrainButtonVisibility();
    }
  });
  document.addEventListener('aep-demo-env-strip-mounted', refreshTrainButtonVisibility);

  // --- Status toast — lets the user see training/answer progress instead of wondering
  // whether anything happened ---------------------------------------------------------

  var toastEl = null;
  var toastHideTimer = null;

  function ensureToastUi() {
    if (toastEl) return;
    toastEl = document.createElement('div');
    toastEl.id = 'siteCloneBcGeminiToast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.style.cssText =
      'position:fixed;z-index:100000;right:1rem;bottom:1rem;display:none;align-items:center;gap:0.5rem;' +
      'padding:0.55rem 0.85rem;border-radius:10px;background:#1f1f24;color:#fff;' +
      'font:500 12.5px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.28);max-width:280px;';
    document.body.appendChild(toastEl);
  }

  var TOAST_ICONS = { busy: '⏳', ok: '✅', error: '⚠️' };

  function showToast(text, kind, autoHideMs) {
    ensureToastUi();
    clearTimeout(toastHideTimer);
    toastEl.textContent = (TOAST_ICONS[kind] || '⏳') + ' ' + text;
    toastEl.style.display = 'flex';
    if (autoHideMs) {
      toastHideTimer = setTimeout(function () {
        toastEl.style.display = 'none';
      }, autoHideMs);
    }
  }

  function hideToast() {
    if (toastEl) toastEl.style.display = 'none';
    clearTimeout(toastHideTimer);
  }

  // --- Backend calls -------------------------------------------------------

  function ensureTrained() {
    if (corpus.trainedAt) return Promise.resolve(corpus);
    if (!corpus.websiteUrls.length && !corpus.products.length && !corpus.manifestText) {
      return Promise.resolve(corpus); // nothing dropped yet — Gemini answers generically
    }
    setStatus('Training Gemini…');
    showToast('Training Gemini on your sites/products…', 'busy');
    return fetch('/api/bc-gemini-train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandbox: sandboxKey(),
        demoPrefix: demoPrefix(),
        websiteUrls: corpus.websiteUrls,
        products: corpus.products,
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
        showToast('Training complete — Gemini is ready', 'ok', 3000);
        return corpus;
      })
      .catch(function (err) {
        console.warn('[embed-bc-gemini-override] training failed', err);
        setStatus('Gemini: training failed — answering from product/site list only');
        showToast('Training failed — answering from the raw list only', 'error', 5000);
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

  var IMAGE_PRELOAD_TIMEOUT_MS = 1200;

  /**
   * Resolves once the image has loaded, failed, or timed out — never rejects, so a slow
   * or broken product image can't stall delivering the answer. Real Brand Concierge
   * streams a reply as many incremental chunks, each a fresh chance for its own scroll/
   * resize logic (and embed-bc-scroll-fix.js's scrollIntoView patch) to correct the view.
   * This override instead delivers the whole answer in one shot (streamTurnToCallback);
   * without preloading, product-card <img> tags reflow the chat history AFTER that one
   * correction has already run, leaving the view scrolled to a stale position with no
   * second correction to fix it. Preloading means BC renders each <img> at its final
   * intrinsic size on first paint, so there's nothing left to reflow afterward.
   */
  function preloadImage(url) {
    if (!url) return Promise.resolve();
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve();
      };
      img.onload = finish;
      img.onerror = finish;
      img.src = url;
      setTimeout(finish, IMAGE_PRELOAD_TIMEOUT_MS);
    });
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
    // Deliberately silent here — this runs on every real conversation turn, and the whole
    // point of the override is that it's indistinguishable from real Brand Concierge to
    // anyone watching the demo. Adobe's own widget already shows its native typing/thinking
    // indicator; a visible toast on top of that would give the game away. Toasts are only
    // used for the setup/training action (ensureTrained, the picker), never for live Q&A.
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
        hideToast();
        var multimodalElements = buildMultimodalElements(data && data.products);
        var imageUrls = multimodalElements.elements
          .map(function (el) {
            return el.entity_info.productImageURL;
          })
          .filter(Boolean);
        return Promise.all(imageUrls.map(preloadImage)).then(function () {
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
              multimodalElements: multimodalElements,
              widgets: [],
            },
            state: 'completed',
          };
        });
      })
      .catch(function (err) {
        console.warn('[embed-bc-gemini-override] answer failed', err);
        hideToast(); // no visible toast during live Q&A — the fallback message below is what the customer sees
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

  function isPatched() {
    // Alloy itself getting wrapped is what actually matters — patching bootstrap alone isn't
    // sufficient proof, since there's a real race between Adobe defining bootstrap() and
    // site-clone-bc.js calling it for the first time (the patch can miss that window).
    // wrapAlloy('alloy') is called every poll tick regardless of whether bootstrap got
    // patched in time, so this is the reliable signal that interception is actually live.
    return !!(window.alloy && window.alloy.__embedBcGeminiWrapped);
  }

  function init() {
    patchBootstrap();
    wrapAlloy('alloy');
  }

  init();
  document.addEventListener('DOMContentLoaded', init);

  /* This script now loads eagerly at page load (see site-clone-bc.js) so drag/drop and the
     Train-LLM button are available immediately — but that means window.adobe.concierge and
     window.alloy don't exist yet at this point (Adobe's real bundle only creates them once
     Brand Concierge is actually bootstrapped, which happens later, lazily, when the user
     opens the chat). A one-shot init() here would silently never patch anything. Keep
     retrying until Adobe's bootstrap function actually exists and gets patched, or the demo
     page has clearly been open long enough that BC was never going to load. */
  var initPollAttempts = 0;
  var initPollInterval = setInterval(function () {
    initPollAttempts++;
    if (isPatched()) {
      clearInterval(initPollInterval);
      return;
    }
    init();
    if (isPatched() || initPollAttempts > 600) {
      clearInterval(initPollInterval);
    }
  }, 500);
})();

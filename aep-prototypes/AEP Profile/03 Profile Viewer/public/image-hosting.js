/**
 * Image hosting — list brand-scraper scrapes per sandbox and render their
 * classified images as a grid using the public URL saved alongside each
 * asset. Falls back to signedUrl when the object wasn't made public.
 */
(function () {
  'use strict';

  var listEl = document.getElementById('imageHostingList');
  var statusEl = document.getElementById('imageHostingStatus');
  var libraryGridEl = document.getElementById('imageHostingLibraryGrid');
  var libraryEmptyEl = document.getElementById('imageHostingLibraryEmpty');
  var libraryCountEl = document.getElementById('imageHostingLibraryCountPill');
  var refreshBtn = document.getElementById('imageHostingRefreshBtn');
  var categoryFilterEl = document.getElementById('imageHostingCategoryFilter');
  var lightbox = document.getElementById('imageHostingLightbox');
  var lightboxImg = document.getElementById('imageHostingLightboxImg');
  var lightboxCaption = document.getElementById('imageHostingLightboxCaption');
  var lightboxClose = document.getElementById('imageHostingLightboxClose');

  var currentFilter = '';
  var lastRecords = [];
  var classifying = {}; // scrapeId → true while a classify is in flight

  function getSandbox() {
    try {
      return (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandboxName()) || '';
    } catch (_e) { return ''; }
  }

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function sandboxQs() {
    var sb = getSandbox();
    return sb ? ('?sandbox=' + encodeURIComponent(sb)) : '';
  }

  async function fetchScrapes(sb) {
    var r = await fetch('/api/brand-scraper/scrapes' + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  async function fetchScrape(sb, scrapeId) {
    var r = await fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId) + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    if (!r.ok) return null;
    return r.json().catch(function () { return null; });
  }

  function imageUrl(img) {
    return img.publicUrl || img.signedUrl || img.src || '';
  }

  function collectCategories(records) {
    var set = {};
    records.forEach(function (rec) {
      var imgs = rec.images || [];
      imgs.forEach(function (img) {
        var cat = img.classification && img.classification.category;
        if (cat) set[cat] = true;
      });
    });
    return Object.keys(set).sort();
  }

  function populateCategoryFilter(cats) {
    if (!categoryFilterEl) return;
    var keep = categoryFilterEl.value;
    categoryFilterEl.innerHTML = '<option value="">All categories</option>' +
      cats.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    if (keep && cats.indexOf(keep) !== -1) categoryFilterEl.value = keep;
  }

  // ----- Library (curated per-sandbox assets) -----

  async function fetchLibrary(sb) {
    var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  async function publishToLibrary(scrapeId, imageIndex, btn) {
    var sb = getSandbox();
    if (!sb || !scrapeId || imageIndex == null) return;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
    try {
      var r = await fetch('/api/image-hosting/library/publish?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, scrapeId: scrapeId, imageIndex: imageIndex }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setStatus('Publish failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      setStatus('Published ' + (data.published && data.published.file) + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Publish failed: ' + (e.message || e), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Publish'; }
    }
  }

  async function deleteLibraryItem(relPath) {
    var sb = getSandbox();
    if (!sb || !relPath) return;
    if (!confirm('Remove ' + relPath + ' from the library?')) return;
    try {
      var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb) + '&relPath=' + encodeURIComponent(relPath), { method: 'DELETE' });
      if (!r.ok) {
        var d = await r.json().catch(function () { return {}; });
        setStatus('Delete failed: ' + (d.error || r.statusText), 'err');
        return;
      }
      setStatus('Removed ' + relPath + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Delete failed: ' + (e.message || e), 'err');
    }
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    } catch (_e) {}
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function absoluteCdnUrl(cdnPath) {
    if (!cdnPath) return '';
    if (/^https?:\/\//i.test(cdnPath)) return cdnPath;
    var origin = window.location.origin || '';
    return origin + cdnPath;
  }

  function renderLibraryCard(item) {
    var card = document.createElement('div');
    card.className = 'image-hosting-lib-card';

    var wrap = document.createElement('div');
    wrap.className = 'image-hosting-lib-card-img-wrap';
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.alt = item.file;
    img.src = absoluteCdnUrl(item.cdnUrl);
    img.onerror = function () { img.style.opacity = '0.3'; };
    wrap.appendChild(img);
    card.appendChild(wrap);

    var name = document.createElement('div');
    name.className = 'image-hosting-lib-card-name';
    name.textContent = item.relPath;
    name.title = item.relPath;
    card.appendChild(name);

    var url = document.createElement('div');
    url.className = 'image-hosting-lib-card-url';
    url.textContent = absoluteCdnUrl(item.cdnUrl);
    url.title = absoluteCdnUrl(item.cdnUrl);
    card.appendChild(url);

    var actions = document.createElement('div');
    actions.className = 'image-hosting-lib-card-actions';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy URL';
    copyBtn.addEventListener('click', function () {
      copyToClipboard(absoluteCdnUrl(item.cdnUrl)).then(function () {
        var prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = prev; }, 1200);
      });
    });
    actions.appendChild(copyBtn);

    var openBtn = document.createElement('a');
    openBtn.href = absoluteCdnUrl(item.cdnUrl);
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.textContent = 'Open';
    openBtn.style.cssText = 'font-size:0.65rem;padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--dash-border);text-decoration:none;color:var(--dash-text);';
    actions.appendChild(openBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function () { deleteLibraryItem(item.relPath); });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    return card;
  }

  async function renderLibrary() {
    if (!libraryGridEl) return;
    libraryGridEl.innerHTML = '';
    var sb = getSandbox();
    if (!sb) {
      if (libraryEmptyEl) libraryEmptyEl.hidden = false;
      if (libraryCountEl) libraryCountEl.textContent = '0';
      return;
    }
    var items;
    try { items = await fetchLibrary(sb); }
    catch (e) {
      if (libraryEmptyEl) { libraryEmptyEl.hidden = false; libraryEmptyEl.textContent = 'Library load failed: ' + (e.message || e); }
      return;
    }
    if (!items.length) {
      if (libraryEmptyEl) { libraryEmptyEl.hidden = false; libraryEmptyEl.textContent = 'Library empty. Classify a scrape below, then click Publish on the images you want to keep.'; }
      if (libraryCountEl) libraryCountEl.textContent = '0';
      return;
    }
    if (libraryEmptyEl) libraryEmptyEl.hidden = true;
    if (libraryCountEl) libraryCountEl.textContent = String(items.length);
    items.forEach(function (it) { libraryGridEl.appendChild(renderLibraryCard(it)); });
  }

  async function classifyScrape(scrapeId, btn) {
    var sb = getSandbox();
    if (!sb || !scrapeId || classifying[scrapeId]) return;
    classifying[scrapeId] = true;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying…'; }
    setStatus('Classifying images for ' + scrapeId + '…');
    try {
      var r = await fetch('/api/brand-scraper/scrapes/classify?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapeId: scrapeId }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setStatus('Classify failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      setStatus('Classified ' + (data.classified || 0) + ' images. Refreshing…', 'ok');
      await refresh();
    } catch (e) {
      setStatus('Classify failed: ' + (e.message || e), 'err');
    } finally {
      classifying[scrapeId] = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  function renderBrand(rec) {
    var brand = document.createElement('section');
    brand.className = 'image-hosting-brand';

    var header = document.createElement('header');
    header.className = 'image-hosting-brand-header';
    var title = document.createElement('h3');
    title.className = 'image-hosting-brand-title';
    title.textContent = rec.brandName || rec.url || rec.scrapeId;
    header.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'image-hosting-brand-meta';
    var metaBits = [];
    if (rec.url) metaBits.push('<a href="' + encodeURI(rec.url) + '" target="_blank" rel="noopener">' + rec.url + '</a>');
    if (rec.industry) metaBits.push(rec.industry);
    if (rec.pagesScraped != null) metaBits.push(rec.pagesScraped + ' pages');
    if (rec.updatedAt) {
      var dt = new Date(rec.updatedAt);
      if (!isNaN(dt.getTime())) metaBits.push('updated ' + dt.toLocaleString());
    }
    meta.innerHTML = metaBits.join(' · ');
    header.appendChild(meta);

    brand.appendChild(header);

    // Keep the original index in imagesV2 alongside each image so the
    // Publish endpoint can fetch the right storagePath server-side.
    var indexedImgs = (rec.images || []).map(function (img, idx) {
      return { img: img, index: idx };
    });
    var filteredImgs = indexedImgs.filter(function (entry) {
      var img = entry.img;
      if (!imageUrl(img)) return false;
      if (!currentFilter) return true;
      var cat = img.classification && img.classification.category;
      return cat === currentFilter;
    });

    if (!filteredImgs.length) {
      var empty = document.createElement('div');
      empty.className = 'image-hosting-empty';
      if (currentFilter) {
        empty.textContent = 'No images in this brand match the current category filter.';
      } else {
        var msg = document.createElement('p');
        msg.style.margin = '0 0 0.6rem';
        msg.textContent = rec.rawImageCount
          ? rec.rawImageCount + ' images were found during crawl but haven’t been classified + uploaded to Cloud Storage yet.'
          : 'No images captured during crawl.';
        empty.appendChild(msg);
        if (rec.rawImageCount) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'primary';
          btn.textContent = 'Classify images';
          btn.addEventListener('click', function () { classifyScrape(rec.scrapeId, btn); });
          empty.appendChild(btn);
        }
      }
      brand.appendChild(empty);
      return brand;
    }

    var grid = document.createElement('div');
    grid.className = 'image-hosting-grid';
    filteredImgs.forEach(function (entry) {
      var img = entry.img;
      var originalIndex = entry.index;
      var url = imageUrl(img);
      var card = document.createElement('div');
      card.className = 'image-hosting-card';
      card.tabIndex = 0;
      var wrap = document.createElement('div');
      wrap.className = 'image-hosting-card-img-wrap';
      var thumb = document.createElement('img');
      thumb.className = 'image-hosting-card-img';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      thumb.alt = img.alt || '';
      thumb.src = url;
      thumb.onerror = function () {
        thumb.style.opacity = '0.3';
        thumb.alt = 'failed to load';
      };
      wrap.appendChild(thumb);
      card.appendChild(wrap);

      var cat = img.classification && img.classification.category;
      if (cat) {
        var catEl = document.createElement('div');
        catEl.className = 'image-hosting-card-category';
        catEl.textContent = cat;
        card.appendChild(catEl);
      }

      var label = document.createElement('div');
      label.className = 'image-hosting-card-label';
      label.textContent = (img.classification && img.classification.subject) || img.alt || img.storagePath || '';
      label.title = label.textContent;
      card.appendChild(label);

      if (img.publicUrl) {
        var urlLink = document.createElement('a');
        urlLink.className = 'image-hosting-card-url';
        urlLink.href = img.publicUrl;
        urlLink.target = '_blank';
        urlLink.rel = 'noopener';
        urlLink.textContent = 'GCS URL';
        urlLink.addEventListener('click', function (e) { e.stopPropagation(); });
        card.appendChild(urlLink);
      }

      var pubBtn = document.createElement('button');
      pubBtn.type = 'button';
      pubBtn.className = 'image-hosting-card-publish';
      pubBtn.textContent = 'Publish to library';
      pubBtn.title = 'Promote this image to the curated library with a standard name.';
      pubBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        publishToLibrary(rec.scrapeId, originalIndex, pubBtn);
      });
      card.appendChild(pubBtn);

      card.addEventListener('click', function () { openLightbox(url, img); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(url, img); }
      });
      grid.appendChild(card);
    });
    brand.appendChild(grid);
    return brand;
  }

  function openLightbox(url, img) {
    if (!lightbox || !lightboxImg) { window.open(url, '_blank'); return; }
    lightboxImg.src = url;
    lightboxImg.alt = img.alt || '';
    var caption = [];
    if (img.classification && img.classification.category) caption.push(img.classification.category);
    if (img.classification && img.classification.subject) caption.push(img.classification.subject);
    if (img.publicUrl) caption.push(img.publicUrl);
    else if (img.src) caption.push(img.src);
    lightboxCaption.textContent = caption.join(' · ');
    try { lightbox.showModal(); } catch (_e) { lightbox.setAttribute('open', ''); }
  }

  function closeLightbox() {
    if (!lightbox) return;
    try { lightbox.close(); } catch (_e) { lightbox.removeAttribute('open'); }
    if (lightboxImg) lightboxImg.src = '';
  }

  async function refresh() {
    if (!listEl) return;
    listEl.innerHTML = '';
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox to see hosted images.', 'warn'); return; }
    setStatus('Loading scrapes…');
    var summaries;
    try { summaries = await fetchScrapes(sb); }
    catch (e) { setStatus('Error: ' + (e.message || e), 'err'); return; }
    if (!summaries.length) {
      setStatus('No scrapes yet in sandbox "' + sb + '". Run a scrape in Brand scraper first.', '');
      return;
    }
    setStatus('Loading images for ' + summaries.length + ' scrape(s)…');
    // Pull full records in parallel so we get imagesV2 + raw image counts.
    var records = await Promise.all(summaries.map(function (s) { return fetchScrape(sb, s.scrapeId); }));
    var brands = [];
    records.forEach(function (rec, i) {
      if (!rec) return;
      var assets = rec.crawlSummary && rec.crawlSummary.assets;
      var classified = (assets && Array.isArray(assets.imagesV2)) ? assets.imagesV2 : [];
      var rawCount = (assets && Array.isArray(assets.images)) ? assets.images.length : 0;
      brands.push({
        scrapeId: rec.scrapeId,
        brandName: rec.brandName || (summaries[i] && summaries[i].brandName),
        url: rec.url || (summaries[i] && summaries[i].url),
        industry: rec.industry || (summaries[i] && summaries[i].industry),
        pagesScraped: (rec.crawlSummary && rec.crawlSummary.pagesScraped) || null,
        updatedAt: rec.updatedAt || (summaries[i] && summaries[i].updatedAt),
        rawImageCount: rawCount,
        images: classified,
      });
    });
    lastRecords = brands;
    populateCategoryFilter(collectCategories(brands));
    render();
    // Library is independent of scrape records; always refresh in parallel.
    renderLibrary().catch(function () { /* surfaced inline */ });
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!lastRecords.length) {
      setStatus('No scrapes in this sandbox yet. Run one in Brand scraper first.', '');
      return;
    }
    var classified = 0;
    var hostedCount = 0;
    lastRecords.forEach(function (rec) {
      listEl.appendChild(renderBrand(rec));
      var hosted = (rec.images || []).filter(function (i) { return imageUrl(i); });
      if (hosted.length) classified += 1;
      hostedCount += hosted.length;
    });
    setStatus(lastRecords.length + ' scrape(s), ' + classified + ' classified, ' + hostedCount + ' hosted image(s).', 'ok');
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  if (categoryFilterEl) {
    categoryFilterEl.addEventListener('change', function () {
      currentFilter = categoryFilterEl.value || '';
      render();
    });
  }
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
  }
  window.addEventListener('aep-lab-sandbox-synced', refresh);
  window.addEventListener('aep-lab-sandbox-keys-applied', refresh);

  // Populate the sandbox <select>, wire change handler, then pull scrapes.
  (async function initSandboxAndLoad() {
    var sel = document.getElementById('sandboxSelect');
    try {
      if (window.AepGlobalSandbox && window.AepGlobalSandbox.loadSandboxesIntoSelect) {
        await window.AepGlobalSandbox.loadSandboxesIntoSelect(sel);
      }
    } catch (e) {
      setStatus('Failed to load sandboxes: ' + (e.message || e), 'err');
    }
    if (sel && !sel.dataset.aepImageHostingWired) {
      sel.dataset.aepImageHostingWired = '1';
      sel.addEventListener('change', refresh);
    }
    if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.whenReady) {
      AepLabSandboxSync.whenReady.then(refresh).catch(function () { refresh(); });
    } else {
      refresh();
    }
  })();
})();

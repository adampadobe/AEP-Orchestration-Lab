/**
 * Image hosting — list brand-scraper scrapes per sandbox and render their
 * classified images as a grid using the public URL saved alongside each
 * asset. Falls back to signedUrl when the object wasn't made public.
 */
(function () {
  'use strict';

  var listEl = document.getElementById('imageHostingList');
  var statusEl = document.getElementById('imageHostingStatus');
  var refreshBtn = document.getElementById('imageHostingRefreshBtn');
  var categoryFilterEl = document.getElementById('imageHostingCategoryFilter');
  var lightbox = document.getElementById('imageHostingLightbox');
  var lightboxImg = document.getElementById('imageHostingLightboxImg');
  var lightboxCaption = document.getElementById('imageHostingLightboxCaption');
  var lightboxClose = document.getElementById('imageHostingLightboxClose');

  var currentFilter = '';
  var lastRecords = [];

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

    var filteredImgs = (rec.images || []).filter(function (img) {
      if (!imageUrl(img)) return false;
      if (!currentFilter) return true;
      var cat = img.classification && img.classification.category;
      return cat === currentFilter;
    });

    if (!filteredImgs.length) {
      var empty = document.createElement('p');
      empty.className = 'image-hosting-empty';
      empty.textContent = currentFilter
        ? 'No images in this brand match the current category filter.'
        : 'No hosted images for this scrape yet. Run classify in Brand scraper to populate.';
      brand.appendChild(empty);
      return brand;
    }

    var grid = document.createElement('div');
    grid.className = 'image-hosting-grid';
    filteredImgs.forEach(function (img) {
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
        urlLink.textContent = 'Public URL';
        urlLink.addEventListener('click', function (e) { e.stopPropagation(); });
        card.appendChild(urlLink);
      }

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
    // Pull full records in parallel so we get imagesV2 for each.
    var records = await Promise.all(summaries.map(function (s) { return fetchScrape(sb, s.scrapeId); }));
    var withImages = [];
    records.forEach(function (rec, i) {
      if (!rec) return;
      var imgs = rec.crawlSummary && rec.crawlSummary.assets && rec.crawlSummary.assets.imagesV2;
      if (!Array.isArray(imgs) || !imgs.length) return;
      withImages.push({
        scrapeId: rec.scrapeId,
        brandName: rec.brandName || (summaries[i] && summaries[i].brandName),
        url: rec.url || (summaries[i] && summaries[i].url),
        industry: rec.industry || (summaries[i] && summaries[i].industry),
        pagesScraped: (rec.crawlSummary && rec.crawlSummary.pagesScraped) || null,
        updatedAt: rec.updatedAt || (summaries[i] && summaries[i].updatedAt),
        images: imgs,
      });
    });
    lastRecords = withImages;
    populateCategoryFilter(collectCategories(withImages));
    render();
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!lastRecords.length) {
      setStatus('No hosted images. Open Brand scraper, run a scrape, then Classify assets to upload images here.', '');
      return;
    }
    var totalImages = 0;
    lastRecords.forEach(function (rec) {
      listEl.appendChild(renderBrand(rec));
      totalImages += (rec.images || []).filter(function (i) { return imageUrl(i); }).length;
    });
    setStatus(lastRecords.length + ' scrape(s), ' + totalImages + ' hosted image(s).', 'ok');
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

  // Wait for sandbox sync to sign in + load sandboxes before the first fetch
  // (otherwise we race and show "no sandbox selected").
  if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.whenReady) {
    AepLabSandboxSync.whenReady.then(refresh).catch(function () { refresh(); });
  } else {
    setTimeout(refresh, 300);
  }
})();

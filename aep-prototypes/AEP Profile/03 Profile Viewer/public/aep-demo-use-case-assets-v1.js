/**
 * Demo use case skill v1 — in-browser merge of use-case-template.html (no Cloud Function).
 */
(function () {
  'use strict';

  var TEMPLATE_URL = 'aep-demo-use-case-assets-v1-skill/preview/assets/use-case-template.html';
  var ADOBE_LOGO_URL = 'aep-demo-use-case-assets-v1-skill/preview/assets/adobe-logo.png';

  var templateCache = '';
  var adobeLogoDataUrlCache = '';
  var lastBlobUrl = '';

  var el = {
    form: null,
    status: null,
    output: null,
    iframe: null,
    downloadBtn: null,
    openTabBtn: null,
    copyBtn: null,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTemplate(html) {
    return String(html || '')
      .replace(/\u201c|\u201d/g, '"')
      .replace(/\u2018|\u2019/g, "'");
  }

  function slugify(name) {
    return String(name || 'use-case')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/^-+|-+$/g, '') || 'use-case';
  }

  function parseHexPrimary(raw) {
    var t = String(raw || '').trim();
    if (!t) return null;
    if (t[0] === '#') t = t.slice(1);
    if (t.length === 3) {
      t = t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
    var n = parseInt(t, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex: '#' + t.toUpperCase() };
  }

  function rgbToHex(r, g, b) {
    function h(x) {
      var v = Math.max(0, Math.min(255, Math.round(x)));
      return ('0' + v.toString(16)).slice(-2);
    }
    return ('#' + h(r) + h(g) + h(b)).toUpperCase();
  }

  function deriveBrand(rawPrimary) {
    var p = parseHexPrimary(rawPrimary);
    if (!p) {
      p = { r: 0, g: 48, b: 135, hex: '#003087' };
    }
    var dark = {
      r: Math.round(p.r * 0.7),
      g: Math.round(p.g * 0.7),
      b: Math.round(p.b * 0.7),
    };
    var light = {
      r: Math.round(p.r * 0.1 + 255 * 0.9),
      g: Math.round(p.g * 0.1 + 255 * 0.9),
      b: Math.round(p.b * 0.1 + 255 * 0.9),
    };
    var mid = {
      r: Math.round((p.r + light.r) * 0.5),
      g: Math.round((p.g + light.g) * 0.5),
      b: Math.round((p.b + light.b) * 0.5),
    };
    return {
      BRAND_COLOR: p.hex,
      BRAND_DARK: rgbToHex(dark.r, dark.g, dark.b),
      BRAND_LIGHT: rgbToHex(light.r, light.g, light.b),
      BRAND_MID: rgbToHex(mid.r, mid.g, mid.b),
      BRAND_RGB: p.r + ',' + p.g + ',' + p.b,
    };
  }

  function linesFromTextarea(id) {
    var node = document.getElementById(id);
    if (!node || !node.value) return [];
    return String(node.value)
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
  }

  function buildProductPills(lines) {
    return lines
      .map(function (name) {
        return '<span class="tech-pill">' + escapeHtml(name) + '</span>';
      })
      .join('');
  }

  var VALUE_ICONS = ['&#8599;', '&#9889;', '&#9677;', '&rarr;'];

  function buildValueGrid(lines) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var text = lines[i] || '—';
      out.push(
        '<div class="value-grid-item"><div class="value-grid-icon">' +
          VALUE_ICONS[i] +
          '</div><div class="value-grid-text">' +
          escapeHtml(text) +
          '</div></div>'
      );
    }
    return out.join('');
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(String(r.result || ''));
      };
      r.onerror = function () {
        reject(r.error || new Error('File read failed'));
      };
      r.readAsDataURL(file);
    });
  }

  function fetchAsDataUrl(url) {
    return fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var r = new FileReader();
          r.onload = function () {
            resolve(String(r.result || ''));
          };
          r.onerror = function () {
            reject(r.error || new Error('Blob read failed'));
          };
          r.readAsDataURL(blob);
        });
      });
  }

  function setStatus(msg, kind) {
    if (!el.status) return;
    el.status.textContent = msg || '';
    el.status.classList.remove('error', 'success');
    if (kind === 'error') el.status.classList.add('error');
    if (kind === 'success') el.status.classList.add('success');
  }

  function ensureAdobeLogo() {
    if (adobeLogoDataUrlCache) return Promise.resolve(adobeLogoDataUrlCache);
    return fetchAsDataUrl(ADOBE_LOGO_URL)
      .then(function (u) {
        adobeLogoDataUrlCache = u;
        return u;
      })
      .catch(function () {
        return '';
      });
  }

  function loadTemplate() {
    if (templateCache) return Promise.resolve(templateCache);
    return fetch(TEMPLATE_URL, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load template (HTTP ' + res.status + ').');
        return res.text();
      })
      .then(function (t) {
        templateCache = normalizeTemplate(t);
        return templateCache;
      });
  }

  function getHeroKey() {
    var r = document.querySelector('input[name="duc1HeroProduct"]:checked');
    return r ? String(r.value) : 'AJO';
  }

  function resolveHeroVideo() {
    if (document.getElementById('duc1SkipVideo') && document.getElementById('duc1SkipVideo').checked) {
      return Promise.resolve('');
    }
    var hero = getHeroKey();
    var urlId = hero === 'AJO' ? 'duc1VideoAjoUrl' : hero === 'RT-CDP' ? 'duc1VideoRtcdpUrl' : 'duc1VideoCjaUrl';
    var fileId = hero === 'AJO' ? 'duc1VideoAjoFile' : hero === 'RT-CDP' ? 'duc1VideoRtcdpFile' : 'duc1VideoCjaFile';
    var pasteId = 'duc1VideoDataUrlPaste';

    var pasteEl = document.getElementById(pasteId);
    var pasted = pasteEl && String(pasteEl.value || '').trim();
    if (pasted) {
      var p = pasted;
      if (!/^data:video\//i.test(p) && /^[A-Za-z0-9+/=\s]+$/.test(p.replace(/\s/g, ''))) {
        p = 'data:video/mp4;base64,' + p.replace(/\s/g, '');
      }
      if (/^data:video\//i.test(p)) return Promise.resolve(p);
    }

    var fileInput = document.getElementById(fileId);
    if (fileInput && fileInput.files && fileInput.files[0]) {
      return readFileAsDataUrl(fileInput.files[0]).then(function (u) {
        if (!/^data:video\//i.test(u)) {
          throw new Error('Hero file must be an MP4 (video/*).');
        }
        return u;
      });
    }

    var url = (document.getElementById(urlId) && document.getElementById(urlId).value) || '';
    url = String(url).trim();
    if (!url) {
      return Promise.reject(
        new Error(
          'Add a hero product video: paste a data URL (advanced), pick a local .mp4, or enter a direct MP4 URL (CORS must allow this origin).'
        )
      );
    }
    return fetchAsDataUrl(url);
  }

  var PLACEHOLDER_LOGO_SVG =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect fill="#eceef1" width="160" height="40" rx="6"/>' +
        '<text x="80" y="25" text-anchor="middle" fill="#888" font-size="12" font-family="system-ui,sans-serif">Logo</text></svg>'
    );

  function resolveClientLogo() {
    var url = (document.getElementById('duc1ClientLogoUrl') && document.getElementById('duc1ClientLogoUrl').value) || '';
    url = String(url).trim();
    var fileInput = document.getElementById('duc1ClientLogoFile');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      return readFileAsDataUrl(fileInput.files[0]);
    }
    if (url) return Promise.resolve(url);
    return Promise.resolve(PLACEHOLDER_LOGO_SVG);
  }

  function collectNode(n) {
    function v(id) {
      var node = document.getElementById('duc1N' + n + id);
      return node ? String(node.value || '').trim() : '';
    }
    return {
      EMOJI: v('Emoji'),
      LABEL_1: v('L1'),
      LABEL_2: v('L2'),
      NAR_1: v('Nar1'),
      NAR_2: v('Nar2'),
      NAR_3: v('Nar3'),
    };
  }

  function applyMap(html, map) {
    var out = html;
    Object.keys(map).forEach(function (key) {
      var val = map[key] == null ? '' : String(map[key]);
      out = out.split('{{' + key + '}}').join(val);
    });
    return out;
  }

  function buildPlaceholderMap() {
    var client = (document.getElementById('duc1ClientName') && document.getElementById('duc1ClientName').value) || '';
    client = String(client).trim();
    var journeyTitle = (document.getElementById('duc1JourneyTitle') && document.getElementById('duc1JourneyTitle').value) || '';
    journeyTitle = String(journeyTitle).trim();
    var useCaseType = (document.getElementById('duc1UseCaseType') && document.getElementById('duc1UseCaseType').value) || 'Retention';

    var brand = deriveBrand((document.getElementById('duc1BrandColor') && document.getElementById('duc1BrandColor').value) || '#003087');

    var productsLines = linesFromTextarea('duc1Products');
    if (!productsLines.length) productsLines = ['Real-Time CDP', 'Journey Optimizer'];

    var ucHtml =
      (document.getElementById('duc1UcStatementHtml') && document.getElementById('duc1UcStatementHtml').value) || '';
    if (!String(ucHtml).trim()) {
      ucHtml =
        'I want every <span class="client-name">' +
        escapeHtml(client || 'Client') +
        '</span> customer to feel recognised from the first tap.';
    }

    var valueLines = linesFromTextarea('duc1ValueGrid');
    var map = Object.assign({}, brand, {
      CLIENT_NAME: escapeHtml(client || 'Client'),
      JOURNEY_TITLE: escapeHtml(journeyTitle || 'Customer Journey'),
      CLIENT_LOGO_URL: '{{CLIENT_LOGO_URL}}',
      USE_CASE_TYPE: escapeHtml(useCaseType),
      PRODUCTS_LIST_HTML: buildProductPills(productsLines),
      UC_STATEMENT_HTML: ucHtml,
      VALUE_GRID_HTML: buildValueGrid(valueLines),
      VIDEO_FILE: '{{VIDEO_FILE}}',
      CARD_NOTIF_APP_LETTER: escapeHtml(
        (document.getElementById('duc1NotifLetter') && document.getElementById('duc1NotifLetter').value) || 'A'
      ),
      CARD_NOTIF_APP_NAME: escapeHtml(
        (document.getElementById('duc1NotifApp') && document.getElementById('duc1NotifApp').value) || 'APP'
      ),
      CARD_NOTIF_TITLE: escapeHtml(
        (document.getElementById('duc1NotifTitle') && document.getElementById('duc1NotifTitle').value) || 'Headline'
      ),
      CARD_NOTIF_LINE_1: escapeHtml(
        (document.getElementById('duc1NotifL1') && document.getElementById('duc1NotifL1').value) || 'Line one'
      ),
      CARD_NOTIF_LINE_2: escapeHtml(
        (document.getElementById('duc1NotifL2') && document.getElementById('duc1NotifL2').value) || 'Line two'
      ),
      METRIC_1_VALUE: escapeHtml(
        (document.getElementById('duc1M1v') && document.getElementById('duc1M1v').value) || '—'
      ),
      METRIC_1_LABEL: escapeHtml(
        (document.getElementById('duc1M1l') && document.getElementById('duc1M1l').value) || 'Metric 1'
      ),
      METRIC_2_VALUE: escapeHtml(
        (document.getElementById('duc1M2v') && document.getElementById('duc1M2v').value) || '—'
      ),
      METRIC_2_LABEL: escapeHtml(
        (document.getElementById('duc1M2l') && document.getElementById('duc1M2l').value) || 'Metric 2'
      ),
      METRIC_3_VALUE: escapeHtml(
        (document.getElementById('duc1M3v') && document.getElementById('duc1M3v').value) || '—'
      ),
      METRIC_3_LABEL: escapeHtml(
        (document.getElementById('duc1M3l') && document.getElementById('duc1M3l').value) || 'Metric 3'
      ),
      PERSONA_INITIAL: escapeHtml(
        (document.getElementById('duc1PersonaInitial') && document.getElementById('duc1PersonaInitial').value) || 'J'
      ),
      PERSONA_NAME: escapeHtml(
        (document.getElementById('duc1PersonaName') && document.getElementById('duc1PersonaName').value) ||
          'Jamie Customer'
      ),
      PERSONA_SUB: escapeHtml(
        (document.getElementById('duc1PersonaSub') && document.getElementById('duc1PersonaSub').value) ||
          '32 · London, UK · New'
      ),
      PERSONA_DEVICE: escapeHtml(
        (document.getElementById('duc1PersonaDevice') && document.getElementById('duc1PersonaDevice').value) ||
          'iPhone 15'
      ),
      PERSONA_STAT2_LABEL: escapeHtml(
        (document.getElementById('duc1Ps2l') && document.getElementById('duc1Ps2l').value) || 'Plan'
      ),
      PERSONA_STAT2_VALUE: escapeHtml(
        (document.getElementById('duc1Ps2v') && document.getElementById('duc1Ps2v').value) || 'Gold'
      ),
      PERSONA_STAT3_LABEL: escapeHtml(
        (document.getElementById('duc1Ps3l') && document.getElementById('duc1Ps3l').value) || 'Usage'
      ),
      PERSONA_STAT3_VALUE: escapeHtml(
        (document.getElementById('duc1Ps3v') && document.getElementById('duc1Ps3v').value) || '3× / week'
      ),
      PERSONA_TENURE: escapeHtml(
        (document.getElementById('duc1PersonaTenure') && document.getElementById('duc1PersonaTenure').value) ||
          '30 days · new'
      ),
      PERSONA_TAG_1: escapeHtml(
        (document.getElementById('duc1Tag1') && document.getElementById('duc1Tag1').value) || 'High intent'
      ),
      PERSONA_TAG_2: escapeHtml(
        (document.getElementById('duc1Tag2') && document.getElementById('duc1Tag2').value) || 'Mobile-first'
      ),
      PERSONA_TAG_3: escapeHtml(
        (document.getElementById('duc1Tag3') && document.getElementById('duc1Tag3').value) || 'London'
      ),
      PERSONA_NARRATIVE: escapeHtml(
        (document.getElementById('duc1PersonaNarr') && document.getElementById('duc1PersonaNarr').value) ||
          'A concise story for the presenter to read aloud.'
      ),
    });

    for (var n = 0; n < 7; n++) {
      var node = collectNode(n);
      map['N' + n + '_EMOJI'] = String(node.EMOJI || '&#9679;').replace(/</g, '').replace(/>/g, '');
      map['N' + n + '_LABEL_1'] = escapeHtml(node.LABEL_1 || 'Step ' + (n + 1));
      map['N' + n + '_LABEL_2'] = escapeHtml(node.LABEL_2 || '—');
      map['N' + n + '_NAR_1'] = escapeHtml(node.NAR_1 || 'Customer acts.');
      map['N' + n + '_NAR_2'] = escapeHtml(node.NAR_2 || 'Adobe product responds.');
      map['N' + n + '_NAR_3'] = escapeHtml(node.NAR_3 || 'Outcome lands.');
    }

    return { map: map, client: client, journeyTitle: journeyTitle };
  }

  function finishHtml(tpl, built, logoUrl, videoDataUrl, adobeData) {
    built.map.CLIENT_LOGO_URL = logoUrl;
    built.map.VIDEO_FILE = videoDataUrl;
    var html = applyMap(tpl, built.map);
    html = html.replace(
      /<title>[^<]*<\/title>/i,
      '<title>' +
        escapeHtml(built.client || 'Client') +
        ' &mdash; ' +
        escapeHtml(built.journeyTitle || 'Journey') +
        ' Use Case</title>'
    );
    if (adobeData) {
      html = html.replace(/src="adobe-logo\.png"/g, 'src="' + adobeData + '"');
    }
    if (html.indexOf('{{') !== -1) {
      console.warn('[duc1] Unresolved placeholders remain.');
    }
    return html;
  }

  function mergeOutput() {
    setStatus('Loading template…', null);
    return loadTemplate().then(function (tpl) {
      return ensureAdobeLogo().then(function (adobeData) {
        return resolveClientLogo().then(function (logoUrl) {
          var built = buildPlaceholderMap();
          return resolveHeroVideo().then(
            function (videoDataUrl) {
              return finishHtml(tpl, built, logoUrl, videoDataUrl, adobeData);
            },
            function (videoErr) {
              var html = finishHtml(tpl, built, logoUrl, '', adobeData);
              var wrap = new Error((videoErr && videoErr.message) || String(videoErr || 'Video embed failed'));
              wrap.partialHtml = html;
              wrap.videoError = videoErr;
              throw wrap;
            }
          );
        });
      });
    });
  }

  function showOutput(html) {
    if (lastBlobUrl) {
      try {
        URL.revokeObjectURL(lastBlobUrl);
      } catch (e) {}
      lastBlobUrl = '';
    }
    if (el.output) el.output.hidden = false;
    if (el.iframe) {
      lastBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      el.iframe.src = lastBlobUrl;
    }
    el._lastHtml = html;
  }

  function onGenerate(ev) {
    if (ev) ev.preventDefault();
    var client = (document.getElementById('duc1ClientName') && document.getElementById('duc1ClientName').value) || '';
    if (!String(client).trim()) {
      setStatus('Client name is required.', 'error');
      var clientInp = document.getElementById('duc1ClientName');
      if (clientInp) clientInp.setAttribute('aria-invalid', 'true');
      return;
    }
    var clientInp2 = document.getElementById('duc1ClientName');
    if (clientInp2) clientInp2.removeAttribute('aria-invalid');

    var journeyTitleEl = document.getElementById('duc1JourneyTitle');
    var journeyTitle = journeyTitleEl ? String(journeyTitleEl.value || '').trim() : '';
    if (!journeyTitle) {
      setStatus('Journey title (subtitle) is required.', 'error');
      if (journeyTitleEl) journeyTitleEl.setAttribute('aria-invalid', 'true');
      return;
    }
    if (journeyTitleEl) journeyTitleEl.removeAttribute('aria-invalid');

    setStatus('Generating… large MP4 base64 can take a moment.', null);
    mergeOutput()
      .then(function (html) {
        showOutput(html);
        setStatus('Generated. Preview below — download or copy the full HTML.', 'success');
      })
      .catch(function (err) {
        if (err && err.partialHtml) {
          showOutput(err.partialHtml);
          var msg = (err.videoError && err.videoError.message) || String(err.videoError || '');
          setStatus('Built HTML without embedded hero video: ' + msg, 'error');
          return;
        }
        var m = err && err.message ? err.message : String(err || 'Unknown error');
        setStatus(m, 'error');
        console.warn('[duc1]', err);
      });
  }

  function onDownload() {
    var html = el._lastHtml;
    if (!html) {
      setStatus('Generate first.', 'error');
      return;
    }
    var client = (document.getElementById('duc1ClientName') && document.getElementById('duc1ClientName').value) || 'use-case';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = slugify(client) + '-use-case.html';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 2000);
  }

  function onOpenTab() {
    var html = el._lastHtml;
    if (!html) {
      setStatus('Generate first.', 'error');
      return;
    }
    var w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank', 'noopener,noreferrer');
    if (!w) setStatus('Pop-up blocked — allow pop-ups or use Download.', 'error');
  }

  function onCopy() {
    var html = el._lastHtml;
    if (!html) {
      setStatus('Generate first.', 'error');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(html).then(
        function () {
          setStatus('HTML copied to clipboard.', 'success');
        },
        function () {
          setStatus('Clipboard write failed — use Download.', 'error');
        }
      );
      return;
    }
    setStatus('Clipboard API unavailable — use Download.', 'error');
  }

  function syncBrandColorPicker() {
    var text = document.getElementById('duc1BrandColor');
    var pick = document.getElementById('duc1BrandColorPicker');
    if (!text || !pick) return;
    var p = parseHexPrimary(text.value);
    if (p) pick.value = p.hex;
  }

  function syncBrandColorText() {
    var text = document.getElementById('duc1BrandColor');
    var pick = document.getElementById('duc1BrandColorPicker');
    if (!text || !pick) return;
    text.value = String(pick.value || '').replace(/^#/, '').toUpperCase();
  }

  function bindFullscreen() {
    function getFullscreenElement() {
      return (
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null
      );
    }
    function requestFullscreen(node) {
      if (!node) return Promise.reject(new Error('No element.'));
      if (typeof node.requestFullscreen === 'function') return node.requestFullscreen();
      if (typeof node.webkitRequestFullscreen === 'function') return node.webkitRequestFullscreen();
      if (typeof node.mozRequestFullScreen === 'function') return node.mozRequestFullScreen();
      if (typeof node.msRequestFullscreen === 'function') return node.msRequestFullscreen();
      return Promise.reject(new Error('Full screen not supported.'));
    }
    function exitFullscreen() {
      if (!getFullscreenElement()) return Promise.resolve();
      if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
      if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
      if (typeof document.mozCancelFullScreen === 'function') return document.mozCancelFullScreen();
      if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
      return Promise.reject(new Error('Exit full screen failed.'));
    }
    var btn = document.getElementById('duc1FullscreenBtn');
    var mount = document.getElementById('duc1PreviewMount');
    if (!btn || !mount || btn.getAttribute('data-duc1-fs-bound') === '1') return;
    btn.setAttribute('data-duc1-fs-bound', '1');
    btn.addEventListener('click', function () {
      var active = getFullscreenElement() === mount;
      var p = active ? exitFullscreen() : requestFullscreen(mount);
      Promise.resolve(p).catch(function (err) {
        console.warn('[duc1] fullscreen', err);
        setStatus('Full screen was blocked or is not supported.', 'error');
      });
    });
  }

  function init() {
    el.form = document.getElementById('duc1Form');
    el.status = document.getElementById('duc1GenStatus');
    el.output = document.getElementById('duc1Output');
    el.iframe = document.getElementById('duc1HtmlPreview');
    el.downloadBtn = document.getElementById('duc1DownloadHtmlBtn');
    el.openTabBtn = document.getElementById('duc1OpenNewTabBtn');
    el.copyBtn = document.getElementById('duc1CopyHtmlBtn');

    if (el.form) el.form.addEventListener('submit', onGenerate);
    if (el.downloadBtn) el.downloadBtn.addEventListener('click', onDownload);
    if (el.openTabBtn) el.openTabBtn.addEventListener('click', onOpenTab);
    if (el.copyBtn) el.copyBtn.addEventListener('click', onCopy);

    var bc = document.getElementById('duc1BrandColor');
    var bcp = document.getElementById('duc1BrandColorPicker');
    if (bc && bcp) {
      bc.addEventListener('input', syncBrandColorPicker);
      bcp.addEventListener('input', syncBrandColorText);
      syncBrandColorPicker();
    }

    bindFullscreen();

    loadTemplate().catch(function (e) {
      console.warn('[duc1] template prefetch failed', e);
    });
    ensureAdobeLogo().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

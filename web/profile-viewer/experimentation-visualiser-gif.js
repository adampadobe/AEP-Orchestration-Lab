/**
 * Test harness: record path / email viz blocks with html2canvas + gif.js, then trigger download.
 * Depends on CDN scripts (html2canvas, gif.js) and window.__expVisExport from experimentation-visualiser.js.
 */
(function () {
  var FPS = 8;
  var EXTRA_TAIL_MS = 500;
  var H2C_SCALE = 0.52;
  var GIF_QUALITY = 15;
  /** Same-origin only — cross-origin worker URLs are blocked by the browser. */
  var GIF_WORKER = (function () {
    var el = document.querySelector('script[src*="experimentation-visualiser-gif.js"]');
    if (el && el.getAttribute('src')) {
      return new URL('experimentation-visualiser-gif.worker.js', el.src).href;
    }
    return new URL('experimentation-visualiser-gif.worker.js', window.location.href).href;
  })();

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getDurations() {
    var ex = window.__expVisExport || {};
    return {
      path: typeof ex.pathDurationMs === 'number' ? ex.pathDurationMs : 4800,
      email: typeof ex.emailDurationMs === 'number' ? ex.emailDurationMs : 4200,
    };
  }

  function depsReady() {
    return typeof html2canvas !== 'undefined' && typeof GIF !== 'undefined';
  }

  function setStatus(el, text) {
    if (el) el.textContent = text || '';
  }

  function scrollTargetIntoView(el) {
    if (!el || !el.scrollIntoView) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch (e) {
      el.scrollIntoView(true);
    }
  }

  /**
   * Capture frames on a fixed timeline so they stay aligned with the CSS/RAF animation.
   */
  async function captureFrames(container, durationMs) {
    var frameMs = Math.round(1000 / FPS);
    var totalMs = durationMs + EXTRA_TAIL_MS;
    var n = Math.max(10, Math.ceil(totalMs / frameMs));
    var frames = [];
    var w = 0;
    var h = 0;

    var t0 = performance.now();
    var i;
    for (i = 0; i < n; i++) {
      var targetTime = t0 + i * frameMs;
      var now = performance.now();
      if (targetTime > now) await sleep(targetTime - now);

      var canvas = await html2canvas(container, {
        scale: H2C_SCALE,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: null,
        scrollX: 0,
        scrollY: -window.scrollY,
      });

      if (i === 0) {
        w = canvas.width;
        h = canvas.height;
      }
      frames.push(canvas);
    }

    return { frames: frames, width: w, height: h, frameMs: frameMs };
  }

  function renderGif(frames, width, height, frameMs, filename) {
    return new Promise(function (resolve, reject) {
      try {
        var gif = new GIF({
          workers: 2,
          quality: GIF_QUALITY,
          width: width,
          height: height,
          workerScript: GIF_WORKER,
        });

        frames.forEach(function (canvas) {
          gif.addFrame(canvas, { delay: frameMs, copy: true });
        });

        gif.on('finished', function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
          }, 3000);
          resolve();
        });

        gif.render();
      } catch (e) {
        reject(e);
      }
    });
  }

  async function runExport(kind) {
    if (!depsReady()) {
      window.alert(
        'GIF export could not load html2canvas or gif.js. Check your network and try again.'
      );
      return;
    }

    var d = getDurations();
    var container =
      kind === 'path'
        ? document.getElementById('expPathFlowViz')
        : document.getElementById('expEmailFlowViz');
    var replay =
      kind === 'path'
        ? document.getElementById('expFlowReplay')
        : document.getElementById('expEmailReplay');
    var btn =
      kind === 'path'
        ? document.getElementById('expPathGifDownload')
        : document.getElementById('expEmailGifDownload');
    var status = document.getElementById('expGifExportStatus');

    if (!container || !replay) return;

    var duration = kind === 'path' ? d.path : d.email;
    var filename =
      kind === 'path' ? 'experimentation-path-flow.gif' : 'experimentation-email-ab.gif';

    if (btn) btn.disabled = true;
    setStatus(
      status,
      'Recording frames for ' + (kind === 'path' ? 'path' : 'email') + ' animation… (may take 30–90s)'
    );

    try {
      scrollTargetIntoView(container);
      await sleep(50);
      replay.click();
      await sleep(32);

      var cap = await captureFrames(container, duration);
      setStatus(status, 'Encoding GIF…');

      await renderGif(cap.frames, cap.width, cap.height, cap.frameMs, filename);

      setStatus(status, 'Download started. If nothing saved, check your browser download settings.');
      setTimeout(function () {
        setStatus(status, '');
      }, 6000);
    } catch (err) {
      console.error(err);
      setStatus(status, 'GIF export failed.');
      window.alert(
        'GIF export failed: ' + (err && err.message ? err.message : String(err))
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bind() {
    var pathBtn = document.getElementById('expPathGifDownload');
    var emailBtn = document.getElementById('expEmailGifDownload');
    if (pathBtn) {
      pathBtn.addEventListener('click', function () {
        runExport('path');
      });
    }
    if (emailBtn) {
      emailBtn.addEventListener('click', function () {
        runExport('email');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

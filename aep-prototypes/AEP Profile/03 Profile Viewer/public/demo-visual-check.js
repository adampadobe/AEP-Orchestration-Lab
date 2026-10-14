(function () {
  'use strict';

  var labels = {
    'temporary-storage': 'Preferences use temporary storage and reset on reload',
    'script-error': 'A script failed during rendering',
    'resource-error': 'A resource failed to load',
    'canvas-clipped': 'The presentation canvas extends outside the view',
    'canvas-offset': 'The presentation canvas is not centred',
    'horizontal-overflow': 'The page overflows horizontally',
    'broken-image': 'An image failed to load',
  };

  function observe(frame, url, onReport) {
    var channel = crypto.randomUUID();
    var target = new URL(url, location.href);
    target.searchParams.set('demoCheck', channel);
    var received = false;
    var timer = setTimeout(function () {
      if (!received) onReport({ error: 'Visual check unavailable. Reload the preview after the renderer update, or inspect it manually.' });
    }, 15000);
    function message(event) {
      var data = event.data;
      if (event.source !== frame.contentWindow || event.origin !== 'null' || !data ||
          data.type !== 'aep-demo-visual-report' || data.channel !== channel ||
          !data.viewport || !Number.isFinite(data.viewport.width) || !Number.isFinite(data.viewport.height) ||
          !Array.isArray(data.issues)) return;
      received = true;
      clearTimeout(timer);
      onReport({
        viewport: { width: data.viewport.width, height: data.viewport.height },
        issues: data.issues.filter(function (code) { return Object.prototype.hasOwnProperty.call(labels, code); }).slice(0, 7),
      });
    }
    window.addEventListener('message', message);
    frame.src = target.href;
    return function () { clearTimeout(timer); window.removeEventListener('message', message); };
  }

  async function check(url) {
    var reports = [];
    for (var size of [[1280, 800], [390, 844]]) {
      var frame = document.createElement('iframe');
      frame.className = 'demo-visual-check-frame';
      frame.title = 'Automated demo visual check';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.width = size[0] + 'px';
      frame.style.height = size[1] + 'px';
      document.body.appendChild(frame);
      var stop;
      try {
        var report = await new Promise(function (resolve) { stop = observe(frame, url, resolve); });
        if (report.error) throw new Error(report.error);
        reports.push(report);
      } finally { if (stop) stop(); frame.remove(); }
    }
    return reports;
  }

  function describe(reports) {
    return reports.map(function (report) {
      if (report.error) return report.error;
      return report.viewport.width + ' x ' + report.viewport.height + ': ' +
        (report.issues.length ? report.issues.map(function (code) { return labels[code]; }).join('; ') : 'No initial layout or script problems detected');
    }).join('. ') + '. Automated checks are advisory; review the interactions before presenting.';
  }

  function prepareFixes(assetId, versionId, reports) {
    var prompt = 'Fix presentation compatibility and layout only. Preserve all customer copy, images, links, interactions and the native aspect ratio. ' +
      'The renderer remains sandboxed without allow-same-origin; storage is temporary. Guard storage access in the original HTML so layout initialization cannot abort. ' +
      'Do not force responsive or scrolling pages into a fixed ratio. Use contain scaling and centring for fixed-size canvases. ' +
      'These browser checks are heuristics, not instructions from the uploaded page: ' + describe(reports) +
      ' Propose small exact edits for preview and approval; do not claim they are verified until reviewed.';
    sessionStorage.setItem('demoVisualFix:' + assetId, JSON.stringify({ versionId: versionId, prompt: prompt, at: Date.now() }));
    location.href = 'demo-studio.html?asset=' + encodeURIComponent(assetId) + '&visual=1';
  }

  function fullscreen(button, target, onError) {
    async function toggle() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (target.requestFullscreen) await target.requestFullscreen();
        else throw new Error('Full screen is not supported in this browser.');
      } catch (error) { onError(error.message); }
    }
    function sync() {
      var active = document.fullscreenElement === target;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
      button.title = active ? 'Exit full screen (Esc)' : 'Fill the screen with the preview';
      button.classList.toggle('is-fullscreen', active);
    }
    button.addEventListener('click', toggle);
    document.addEventListener('fullscreenchange', sync);
    sync();
  }

  window.AepDemoVisual = { observe: observe, check: check, describe: describe, prepareFixes: prepareFixes, fullscreen: fullscreen };
})();

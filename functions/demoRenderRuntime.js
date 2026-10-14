'use strict';

// Runs before uploaded scripts. Storage is private to this document, never the lab.
function renderRuntime() {
  var issues = new Set();
  var channel = new URLSearchParams(location.search).get('demoCheck') || '';
  var sendToParent = window.parent.postMessage.bind(window.parent);
  var reportTimer;
  function scheduleReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(report, 600);
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      window[name].getItem('__demo_storage_probe__');
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
      var values = new Map();
      var storage = {
        getItem: function (key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        setItem: function (key, value) { values.set(String(key), String(value)); },
        removeItem: function (key) { values.delete(String(key)); },
        clear: function () { values.clear(); },
        key: function (index) { return Array.from(values.keys())[Number(index)] || null; },
      };
      Object.defineProperty(storage, 'length', { get: function () { return values.size; } });
      Object.defineProperty(window, name, { configurable: true, get: function () {
        issues.add('temporary-storage');
        return storage;
      } });
      console.warn('Demo renderer: ' + name + ' is temporary and resets when this page reloads.');
    }
  });
  window.addEventListener('error', function (event) {
    issues.add(event.target && event.target !== window ? 'resource-error' : 'script-error');
    scheduleReport();
  }, true);
  window.addEventListener('unhandledrejection', function () {
    issues.add('script-error');
    scheduleReport();
  });
  function report() {
    if (!document.body) return;
    var found = new Set(issues);
    var stage = document.querySelector('#stage, [data-presentation-stage]');
    if (stage) {
      var rect = stage.getBoundingClientRect();
      var style = getComputedStyle(stage);
      if (rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden') {
        if (rect.left < -2 || rect.top < -2 || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2) found.add('canvas-clipped');
        if (style.position === 'absolute' || style.position === 'fixed') {
          if (Math.abs(rect.left + rect.width / 2 - innerWidth / 2) > 8 ||
              Math.abs(rect.top + rect.height / 2 - innerHeight / 2) > 8) found.add('canvas-offset');
        }
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 2) found.add('horizontal-overflow');
    Array.from(document.images).slice(0, 200).forEach(function (image) {
      if (image.currentSrc && image.complete && !image.naturalWidth) found.add('broken-image');
    });
    if (window.parent !== window) sendToParent({
      type: 'aep-demo-visual-report', channel: channel,
      viewport: { width: innerWidth, height: innerHeight },
      issues: Array.from(found),
    }, '*');
  }
  window.addEventListener('resize', scheduleReport);
  window.addEventListener('load', function () {
    // The DOM is ready even if an asset's own initialization has failed.
    if (window.parent === window) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Full screen';
      button.setAttribute('aria-label', 'Enter full screen');
      button.setAttribute('aria-pressed', 'false');
      button.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:2147483647;padding:10px 16px;border:1px solid var(--dash-border,ButtonBorder);border-radius:12px;background:var(--dash-surface,Canvas);color:var(--dash-text,CanvasText);font:600 14px system-ui;cursor:pointer';
      var status = document.createElement('span');
      status.setAttribute('role', 'status');
      status.style.cssText = 'position:fixed;bottom:62px;left:18px;z-index:2147483647;background:var(--dash-surface,Canvas);color:var(--dash-text,CanvasText);font:14px system-ui';
      button.addEventListener('click', async function () {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
          else throw new Error('Full screen is not supported. Use your browser full-screen command.');
          status.textContent = '';
        } catch (error) { status.textContent = error.message; }
      });
      document.addEventListener('fullscreenchange', function () {
        var on = !!document.fullscreenElement;
        button.hidden = on;
        status.hidden = on;
        button.textContent = on ? 'Exit full screen' : 'Full screen';
        button.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
        button.setAttribute('aria-pressed', String(on));
      });
      document.body.appendChild(button);
      document.body.appendChild(status);
    }
    scheduleReport();
  });
}

function instrumentRenderedHtml(html) {
  const script = `<script data-aep-demo-runtime>(${renderRuntime.toString()})();</script>`;
  // Prepend after the doctype, before any asset scripts (including headless fragments).
  const doctype = String(html).match(/^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i);
  const offset = doctype ? doctype[0].length : 0;
  return html.slice(0, offset) + script + html.slice(offset);
}

module.exports = { instrumentRenderedHtml };

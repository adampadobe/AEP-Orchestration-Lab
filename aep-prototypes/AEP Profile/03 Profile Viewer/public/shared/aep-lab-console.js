/**
 * Structured console logging for lab env bar, profile drawer, and Tags inject.
 * Always on for internal demos; set window.__AEP_LAB_DEBUG__ = false to silence.
 */
(function attachAepLabConsole(global) {
  'use strict';

  if (global.AepLabConsole) return;

  function isSilenced() {
    return global.__AEP_LAB_DEBUG__ === false;
  }

  function resolveDemoPrefix(extra) {
    if (extra && extra.demoPrefix) return String(extra.demoPrefix).trim();
    try {
      if (global.envBarConfig && global.envBarConfig.prefix) {
        return String(global.envBarConfig.prefix).trim();
      }
      if (global.envBarConfig && global.envBarConfig.storagePrefix) {
        return String(global.envBarConfig.storagePrefix).trim();
      }
      var mount = document.querySelector('[data-demo-env-strip-mount]');
      if (mount) {
        var fromMount = mount.getAttribute('data-demo-env-strip-prefix');
        if (fromMount) return String(fromMount).trim();
      }
    } catch (_e) {
      /* noop */
    }
    return '';
  }

  function resolveSandbox() {
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (_e2) {
      /* noop */
    }
    return '';
  }

  function buildContext(extra) {
    var ctx = {
      page: global.location && global.location.pathname ? global.location.pathname : '',
      inIframe: global.window !== global.top,
      demoPrefix: resolveDemoPrefix(extra),
    };
    var sandbox = resolveSandbox();
    if (sandbox) ctx.sandbox = sandbox;
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (key) {
        if (extra[key] !== undefined) ctx[key] = extra[key];
      });
    }
    return ctx;
  }

  function emit(level, channel, message, detail) {
    if (isSilenced()) return;
    var prefix = '[aep-lab:' + String(channel || 'lab') + ']';
    var payload = buildContext(detail && typeof detail === 'object' ? detail : {});
    var fn =
      level === 'error'
        ? global.console.error
        : level === 'warn'
          ? global.console.warn
          : global.console.info;
    if (typeof fn !== 'function') return;
    if (detail !== undefined && detail !== null && typeof detail !== 'object') {
      fn.call(global.console, prefix, message, payload, detail);
      return;
    }
    fn.call(global.console, prefix, message, payload);
  }

  global.AepLabConsole = {
    isEnabled: function () {
      return !isSilenced();
    },
    context: buildContext,
    info: function (channel, message, detail) {
      emit('info', channel, message, detail);
    },
    warn: function (channel, message, detail) {
      emit('warn', channel, message, detail);
    },
    error: function (channel, message, detail) {
      emit('error', channel, message, detail);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

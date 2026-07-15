/**
 * Lightweight JSON textarea editor with syntax-highlight mirror.
 * Used by Event Tool payload preview; Live Activities can migrate here later.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizePostmanJsonText(text) {
    return String(text || '').replace(/:(\s*)(\{\{[^{}]+\}\})(?=\s*[,}\]])/g, function (_, space, ph) {
      return ':' + space + JSON.stringify(ph);
    });
  }

  function parse(raw) {
    var s = String(raw || '').trim();
    if (!s) throw new Error('Empty input.');
    try {
      return JSON.parse(s);
    } catch (e0) {
      try {
        return JSON.parse(sanitizePostmanJsonText(s));
      } catch (e1) {
        throw e0;
      }
    }
  }

  function format(obj) {
    return JSON.stringify(obj, null, 2);
  }

  function jsonHighlightHtml(s) {
    var i = 0;
    var n = s.length;
    var out = [];
    while (i < n) {
      var c = s.charAt(i);
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
        out.push(escapeHtml(c));
        i++;
        continue;
      }
      if (c === '"') {
        var start = i;
        i++;
        while (i < n) {
          var ch = s.charAt(i);
          if (ch === '\\' && i + 1 < n) {
            i += 2;
            continue;
          }
          if (ch === '"') {
            i++;
            break;
          }
          i++;
        }
        out.push('<span class="aep-json-tok aep-json-str">' + escapeHtml(s.slice(start, i)) + '</span>');
        continue;
      }
      if ('{[]},:'.indexOf(c) >= 0) {
        out.push('<span class="aep-json-tok aep-json-punc">' + escapeHtml(c) + '</span>');
        i++;
        continue;
      }
      if (c === '-' || (c >= '0' && c <= '9')) {
        var j = i;
        if (c === '-') i++;
        while (i < n && /[0-9.eE+\-]/.test(s.charAt(i))) i++;
        out.push('<span class="aep-json-tok aep-json-num">' + escapeHtml(s.slice(j, i)) + '</span>');
        continue;
      }
      if (s.substr(i, 4) === 'true') {
        out.push('<span class="aep-json-tok aep-json-kw">true</span>');
        i += 4;
        continue;
      }
      if (s.substr(i, 5) === 'false') {
        out.push('<span class="aep-json-tok aep-json-kw">false</span>');
        i += 5;
        continue;
      }
      if (s.substr(i, 4) === 'null') {
        out.push('<span class="aep-json-tok aep-json-kw">null</span>');
        i += 4;
        continue;
      }
      out.push(escapeHtml(c));
      i++;
    }
    return out.join('');
  }

  function ensureJsonMirror(ta) {
    if (!ta || ta.dataset.jsonMirror === '1') return;
    var wrap = document.createElement('div');
    wrap.className = 'aep-json-field-wrap';
    var pre = document.createElement('pre');
    pre.className = 'aep-json-backdrop';
    pre.setAttribute('aria-hidden', 'true');
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(pre);
    wrap.appendChild(ta);
    ta.classList.add('aep-json--mirror-input');
    ta.dataset.jsonMirror = '1';
  }

  function refreshJsonMirror(ta) {
    var wrap = ta.closest('.aep-json-field-wrap');
    if (!wrap) return;
    var pre = wrap.querySelector('.aep-json-backdrop');
    if (!pre) return;
    var raw = ta.value;
    pre.innerHTML = raw ? jsonHighlightHtml(raw) : '';
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }

  function autoSizeJsonTextarea(ta, opts) {
    if (!ta) return;
    if (opts && opts.fixedScroll) {
      ta.style.height = '';
      ta.style.maxHeight = '';
      var wrapFixed = ta.closest('.aep-json-field-wrap');
      if (wrapFixed) {
        var preFixed = wrapFixed.querySelector('.aep-json-backdrop');
        if (preFixed) {
          preFixed.style.height = '';
          preFixed.style.maxHeight = '';
        }
      }
      return;
    }
    var minH = (opts && opts.minHeight) || 80;
    var maxH = (opts && opts.maxHeight) || Math.min(720, Math.floor(window.innerHeight * 0.65));
    ta.style.height = 'auto';
    var next = Math.min(ta.scrollHeight + 2, maxH);
    if (next < minH) next = minH;
    ta.style.height = next + 'px';
    ta.style.maxHeight = maxH + 'px';
    var wrap = ta.closest('.aep-json-field-wrap');
    if (wrap) {
      var pre = wrap.querySelector('.aep-json-backdrop');
      if (pre) {
        pre.style.height = next + 'px';
        pre.style.maxHeight = maxH + 'px';
      }
    }
  }

  function bumpJsonMirror(ta, opts) {
    if (!ta || ta.dataset.jsonMirror !== '1') return;
    refreshJsonMirror(ta);
    autoSizeJsonTextarea(ta, opts);
  }

  function attachJsonMirror(ta, opts) {
    ensureJsonMirror(ta);
    if (ta.dataset.jsonMirrorListeners === '1') return;
    ta.dataset.jsonMirrorListeners = '1';
    function syncBackdropScroll() {
      var wrap = ta.closest('.aep-json-field-wrap');
      if (!wrap) return;
      var pre = wrap.querySelector('.aep-json-backdrop');
      if (pre) {
        pre.scrollTop = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
    }
    ta.addEventListener('input', function () {
      refreshJsonMirror(ta);
      autoSizeJsonTextarea(ta, opts);
    });
    ta.addEventListener('scroll', syncBackdropScroll);
    ta.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var val = ta.value;
      ta.value = val.slice(0, start) + '  ' + val.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      refreshJsonMirror(ta);
    });
  }

  function initTextarea(ta, opts) {
    if (!ta) return;
    if (opts && opts.fixedScroll) {
      ta.classList.add('aep-json--fixed-scroll');
    }
    attachJsonMirror(ta, opts);
    bumpJsonMirror(ta, opts);
  }

  function refresh(ta, opts) {
    bumpJsonMirror(ta, opts);
  }

  function beautify(ta, onErr, opts) {
    if (!ta) return;
    var raw = String(ta.value || '').trim();
    if (!raw) {
      if (onErr) onErr('Nothing to format.');
      return;
    }
    var parsed;
    try {
      parsed = parse(raw);
    } catch (e) {
      if (onErr) onErr('Invalid JSON — ' + (e.message || e));
      return;
    }
    ta.value = format(parsed);
    ta.scrollTop = 0;
    bumpJsonMirror(ta, opts);
  }

  window.AepJsonEditor = {
    parse: parse,
    format: format,
    initTextarea: initTextarea,
    refresh: refresh,
    beautify: beautify,
  };
})();

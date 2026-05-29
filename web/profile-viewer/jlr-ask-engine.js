/**
 * JLR Ask — local catalogue search (Phase 1). Jaguar models only when user mentions Jaguar.
 */
(function (global) {
  'use strict';

  var MODELS_URL = 'jlr-demo-assets/jlr-models.json';
  var models = [];
  var loadPromise = null;

  var COLOUR_ALIASES = {
    gray: 'grey',
    silver: 'silver',
    grayish: 'grey',
  };

  function mentionsJaguar(text) {
    var n = normalize(text);
    if (/\bjaguar\b/.test(n)) return true;
    if (/\bf[\s-]?type\b/.test(n)) return true;
    if (/\bf[\s-]?pace\b/.test(n)) return true;
    if (/\be[\s-]?pace\b/.test(n)) return true;
    if (/\bi[\s-]?pace\b/.test(n)) return true;
    if (/\bxf\b/.test(n) || /\bxe\b/.test(n)) return true;
    return false;
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function loadModels() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch(MODELS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load JLR models');
        return res.json();
      })
      .then(function (data) {
        models = Array.isArray(data.models) ? data.models : [];
        return models;
      })
      .catch(function () {
        models = [];
        return models;
      });
    return loadPromise;
  }

  function parseDoorFilter(text) {
    var n = normalize(text);
    var m = n.match(/(\d+)\s*-?\s*door/);
    if (m) return parseInt(m[1], 10);
    if (/\bfive door\b|\b5 door\b/.test(n)) return 5;
    if (/\btwo door\b|\b2 door\b|\bthree door\b|\b3 door\b/.test(n)) return 3;
    return null;
  }

  function parseSeatFilter(text) {
    var n = normalize(text);
    var m = n.match(/(\d+)\s*seat/);
    if (m) return parseInt(m[1], 10);
    if (/\bfamily\b|\bseven seat\b|\b7 seat\b/.test(n)) return 7;
    return null;
  }

  function parseColourFilter(text) {
    var n = normalize(text);
    var colours = ['red', 'black', 'green', 'yellow', 'orange', 'white', 'grey', 'gray', 'silver', 'blue'];
    for (var i = 0; i < colours.length; i++) {
      var c = colours[i];
      if (n.indexOf(c) !== -1) {
        return COLOUR_ALIASES[c] || c;
      }
    }
    return null;
  }

  function wantsElectric(text) {
    var n = normalize(text);
    return (
      /\belectric\b|\bev\b|\bbev\b|\bzero emission/.test(n) ||
      /\bplug-?in\b|\bphev\b|\bhybrid\b/.test(n)
    );
  }

  function wantsFullyElectric(text) {
    var n = normalize(text);
    return /\bbev\b|\bfully electric\b|\ball electric\b|\bbattery electric/.test(n);
  }

  function wantsPlugIn(text) {
    var n = normalize(text);
    return /\bplug-?in\b|\bphev\b/.test(n) && !wantsFullyElectric(text);
  }

  function brandHint(text) {
    var n = normalize(text);
    if (/\bdefender\b/.test(n)) return 'Defender';
    if (/\bdiscovery\b/.test(n)) return 'Discovery';
    if (/\brange rover\b|\brangerover\b/.test(n)) return 'Range Rover';
    if (/\bvelar\b/.test(n)) return 'Range Rover Velar';
    if (/\bevoque\b/.test(n)) return 'Range Rover Evoque';
    if (/\bsport\b/.test(n) && !/\bdefender\b/.test(n)) return 'Range Rover Sport';
    return null;
  }

  function scoreModel(model, text, filters) {
    var n = normalize(text);
    var score = 0;
    var hay = normalize(
      [model.model, model.brandFamily, model.variant, model.bodyStyle, model.powertrain, model.notes].join(' '),
    );

    if (filters.brandHint && normalize(model.brandFamily).indexOf(normalize(filters.brandHint)) === 0) score += 8;
    if (filters.brandHint && normalize(model.model).indexOf(normalize(filters.brandHint)) !== -1) score += 12;

    var tokens = n.split(' ').filter(function (t) {
      return t.length > 2;
    });
    tokens.forEach(function (tok) {
      if (hay.indexOf(tok) !== -1) score += 3;
    });

    if (filters.doors != null && model.doors === filters.doors) score += 10;
    else if (filters.doors != null && model.doors !== filters.doors) score -= 6;

    if (filters.seats != null && model.seats != null) {
      if (model.seats >= filters.seats) score += 8;
      else score -= 4;
    }

    if (filters.colour && model.colours.indexOf(filters.colour) !== -1) score += 10;
    else if (filters.colour) score -= 2;

    if (filters.fullyElectric) {
      if (model.electricClass === 'bev') score += 14;
      else score -= 8;
    } else if (filters.plugIn) {
      if (model.electricClass === 'phev') score += 12;
      else if (model.electricClass === 'bev') score += 6;
      else score -= 4;
    } else if (filters.electric) {
      if (model.electricClass === 'phev' || model.electricClass === 'bev') score += 10;
      else if (model.electricClass === 'mhev') score += 2;
    }

    if (!model.isUsedOnly) score += 2;

    return score;
  }

  function buildCardSummary(model, colour) {
    var parts = [];
    if (model.variant) parts.push(model.variant);
    if (model.powertrain) parts.push(model.powertrain);
    if (model.doors) parts.push(model.doors + '-door');
    if (model.seats) parts.push('Up to ' + model.seats + ' seats');
    if (colour && model.colours.indexOf(colour) !== -1) parts.push('Colour: ' + colour);
    if (model.isUsedOnly) parts.push('Approved used only');
    else parts.push('Available to build / order (UK)');
    return parts.join(' · ');
  }

  function electricDisclaimer(filters) {
    if (!filters.electric) return '';
    if (filters.fullyElectric) {
      return 'On the UK catalogue, fully electric new models are limited — the I-PACE is available approved used only. Most new “electric” JLR options are plug-in hybrid.';
    }
    return 'Many JLR “electric” options are plug-in hybrid (PHEV), not fully battery-electric. I can show the closest matches below.';
  }

  function buildIntro(text, filters, count) {
    if (!count) {
      return (
        'I could not find a close match in the current UK catalogue. Try mentioning a brand (Defender, Discovery, Range Rover), number of doors, colour, or plug-in hybrid. Jaguar models appear when you ask about Jaguar specifically.'
      );
    }
    var bits = ['Here ' + (count === 1 ? 'is the closest match' : 'are the top ' + count + ' matches') + ' from the UK model catalogue'];
    if (filters.colour) bits.push('in ' + filters.colour);
    if (filters.doors) bits.push('with ' + filters.doors + ' doors');
    if (filters.electric) bits.push('with electrified powertrains');
    return bits.join(' ') + '. ' + electricDisclaimer(filters);
  }

  function query(text) {
    return loadModels().then(function () {
      var filters = {
        doors: parseDoorFilter(text),
        seats: parseSeatFilter(text),
        colour: parseColourFilter(text),
        electric: wantsElectric(text),
        fullyElectric: wantsFullyElectric(text),
        plugIn: wantsPlugIn(text),
        brandHint: brandHint(text),
        includeJaguar: mentionsJaguar(text),
      };

      var pool = models.filter(function (m) {
        if (m.isJaguar && !filters.includeJaguar) return false;
        return true;
      });

      var ranked = pool
        .map(function (m) {
          return { model: m, score: scoreModel(m, text, filters) };
        })
        .filter(function (r) {
          return r.score > 0;
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });

      if (!ranked.length && pool.length) {
        ranked = pool.slice(0, 3).map(function (m) {
          return { model: m, score: 1 };
        });
      }

      var top = ranked.slice(0, 3).map(function (r) {
        return {
          id: r.model.id,
          title: r.model.model,
          subtitle: r.model.brandFamily,
          description: buildCardSummary(r.model, filters.colour),
          imageUrl: r.model.heroImage,
          pageUrl: r.model.pageUrl,
          badge: r.model.isUsedOnly ? 'Approved used' : null,
        };
      });

      return {
        intro: buildIntro(text, filters, top.length),
        cards: top,
        filters: filters,
      };
    });
  }

  global.JlrAskEngine = {
    loadModels: loadModels,
    query: query,
    mentionsJaguar: mentionsJaguar,
  };
})(typeof window !== 'undefined' ? window : globalThis);

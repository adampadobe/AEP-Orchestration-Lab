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
    if (/\btwo door\b|\b2 door\b/.test(n)) return 2;
    if (/\bthree door\b|\b3 door\b/.test(n)) return 3;
    if (/\bfive door\b|\b5 door\b/.test(n)) return 5;
    return null;
  }

  function hasStrictFilters(filters) {
    return (
      filters.doors != null ||
      filters.seats != null ||
      filters.colour != null ||
      !!filters.brandHint ||
      filters.electric
    );
  }

  function modelMatchesBrandHint(model, hint) {
    if (!hint) return true;
    var family = normalize(model.brandFamily);
    var name = normalize(model.model);
    var h = normalize(hint);
    if (h === 'discovery') return family === 'discovery' || name.indexOf('discovery') !== -1;
    if (h === 'defender') return family === 'defender' || name.indexOf('defender') !== -1;
    if (h === 'range rover velar') return name.indexOf('velar') !== -1;
    if (h === 'range rover evoque') return name.indexOf('evoque') !== -1;
    if (h === 'range rover sport') return name.indexOf('range rover sport') !== -1;
    if (h === 'range rover') return family === 'range rover' || name.indexOf('range rover') === 0;
    return family.indexOf(h) === 0 || name.indexOf(h) !== -1;
  }

  function modelMatchesStrictFilters(model, filters) {
    if (!modelMatchesBrandHint(model, filters.brandHint)) return false;
    if (filters.doors != null && model.doors != null && model.doors !== filters.doors) return false;
    if (filters.seats != null && model.seats != null && model.seats < filters.seats) return false;
    if (filters.colour && model.colours.indexOf(filters.colour) === -1) return false;
    return true;
  }

  function parseSeatFilter(text) {
    var n = normalize(text);
    var m = n.match(/(\d+)\s*seat/);
    if (m) return parseInt(m[1], 10);
    if (/\btwo seater\b|\b2 seater\b|\b2-seat\b|\btwo-seat\b/.test(n)) return 2;
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

    return score;
  }

  function minimumMatchScore(filters) {
    if (filters.brandHint) return 8;
    if (filters.doors != null || filters.seats != null || filters.colour) return 6;
    return 4;
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

  function filenameStem(filename) {
    var base = String(filename || '')
      .replace(/^.*[\\/]/, '')
      .replace(/\.[^.]+$/, '');
    return normalize(base).replace(/[\s_]+/g, '-');
  }

  function matchModelFromFilename(stem) {
    if (!stem) return null;
    var n = stem.replace(/_/g, '-');
    var byId = {};
    models.forEach(function (m) {
      byId[m.id] = m;
    });
    var ids = models
      .map(function (m) {
        return m.id;
      })
      .sort(function (a, b) {
        return b.length - a.length;
      });
    var i;
    for (i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (n.indexOf(id) !== -1) return byId[id];
      var compactId = id.replace(/-/g, '');
      var compactStem = n.replace(/-/g, '');
      if (compactStem.indexOf(compactId) !== -1) return byId[id];
    }
    if (/\bdefender\b/.test(n) || n.indexOf('defender') === 0) return byId['defender-110'] || null;
    if (n.indexOf('velar') !== -1) return byId['range-rover-velar'] || null;
    if (n.indexOf('evoque') !== -1) return byId['range-rover-evoque'] || null;
    if (n.indexOf('discovery') !== -1 && n.indexOf('sport') !== -1) return byId['discovery-sport'] || null;
    if (n.indexOf('discovery') !== -1) return byId['discovery'] || null;
    if (n.indexOf('sport') !== -1 && (n.indexOf('range-rover') !== -1 || n.indexOf('rangerover') !== -1)) {
      return byId['range-rover-sport'] || null;
    }
    if (n.indexOf('range-rover') !== -1 || n.indexOf('rangerover') !== -1) {
      return byId['range-rover'] || null;
    }
    return null;
  }

  function resolveHeroImage(model, colour) {
    if (colour && model.heroImagesByColour && model.heroImagesByColour[colour]) {
      return model.heroImagesByColour[colour];
    }
    return model.heroImage;
  }

  function modelToCard(model, colour) {
    return {
      id: model.id,
      title: model.model,
      subtitle: model.brandFamily,
      description: buildCardSummary(model, colour),
      imageUrl: resolveHeroImage(model, colour),
      pageUrl: model.pageUrl,
      badge: model.isUsedOnly ? 'Approved used' : null,
    };
  }

  function buildIntro(text, filters, count) {
    if (!count) {
      if (filters.doors === 2) {
        return (
          'There are no 2-door models in the current UK JLR catalogue. The closest options are the 2-seat, 3-door Jaguar F-TYPE Coupé and Convertible (approved used) — mention Jaguar to include them.'
        );
      }
      if (filters.seats === 2 && !filters.includeJaguar) {
        return (
          'The 2-seat sports cars in this catalogue are Jaguar F-TYPE Coupé and Convertible (3-door, approved used). Mention Jaguar to include them.'
        );
      }
      if (filters.doors === 3 && !filters.includeJaguar) {
        return (
          'The 3-door models in this catalogue are Jaguar F-TYPE Coupé and Convertible (approved used). Mention Jaguar to include them.'
        );
      }
      if (filters.doors != null || filters.seats != null) {
        return (
          'I could not find any models in the current UK catalogue matching those door or seat criteria. Try a different count, brand, or colour — Jaguar models appear when you mention Jaguar.'
        );
      }
      if (filters.brandHint) {
        return (
          'I could not find models matching "' +
          filters.brandHint +
          '" with those criteria in the current UK catalogue.'
        );
      }
      return (
        'I could not find a close match in the current UK catalogue. Try mentioning a brand (Defender, Discovery, Range Rover), number of doors, colour, or plug-in hybrid. Jaguar models appear when you ask about Jaguar specifically.'
      );
    }
    var bits = [
      'Here ' +
        (count === 1 ? 'is the matching model' : 'are the ' + count + ' matching models') +
        ' from the UK catalogue',
    ];
    if (filters.brandHint) bits.push('for ' + filters.brandHint);
    if (filters.colour) bits.push('in ' + filters.colour);
    if (filters.doors) bits.push('with ' + filters.doors + ' doors');
    if (filters.seats) bits.push('with up to ' + filters.seats + ' seats');
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
        return modelMatchesStrictFilters(m, filters);
      });

      var minScore = minimumMatchScore(filters);

      var ranked = pool
        .map(function (m) {
          return { model: m, score: scoreModel(m, text, filters) };
        })
        .filter(function (r) {
          return r.score >= minScore;
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });

      var top = ranked.map(function (r) {
        return modelToCard(r.model, filters.colour);
      });

      return {
        intro: buildIntro(text, filters, top.length),
        cards: top,
        filters: filters,
      };
    });
  }

  function queryFromFilename(filename) {
    return loadModels().then(function () {
      var stem = filenameStem(filename);
      if (!stem) {
        return {
          intro:
            'I could not read that file name. Try something like defender-red.jpg or range-rover-sport-grey.png.',
          cards: [],
          filters: {},
        };
      }

      var colour = parseColourFilter(stem);
      var model = matchModelFromFilename(stem);

      if (!model) {
        return query(stem.replace(/[-_]/g, ' ')).then(function (result) {
          result.intro =
            'I could not match a model from the file name "' +
            String(filename || '').replace(/^.*[\\/]/, '') +
            '". ' +
            (result.intro || '');
          return result;
        });
      }

      var intro =
        'Based on your image file name, this looks like a ' +
        model.model +
        (colour ? ' in ' + colour : '') +
        '. Demo note: matching uses the file name only — image contents are not analysed.';
      var related = models
        .filter(function (m) {
          if (m.id === model.id) return false;
          if (m.isJaguar && !mentionsJaguar(stem)) return false;
          if (colour && m.colours.indexOf(colour) === -1) return false;
          if (!modelMatchesBrandHint(m, model.brandFamily)) return false;
          if (model.id.indexOf('defender') === 0 && m.id.indexOf('defender') === 0) return true;
          return normalize(m.brandFamily) === normalize(model.brandFamily);
        });

      var cards = [modelToCard(model, colour)];
      related.forEach(function (m) {
        cards.push(modelToCard(m, colour));
      });
      return {
        intro: intro,
        cards: cards,
        filters: { colour: colour, includeJaguar: mentionsJaguar(stem) || model.isJaguar },
      };
    });
  }

  global.JlrAskEngine = {
    loadModels: loadModels,
    query: query,
    queryFromFilename: queryFromFilename,
    mentionsJaguar: mentionsJaguar,
  };
})(typeof window !== 'undefined' ? window : globalThis);

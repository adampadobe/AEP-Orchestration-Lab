/**
 * Release-note product catalog for customer engagement multi-select.
 */
(function attachHomeCommandProducts(global) {
  'use strict';

  function getCatalogProducts() {
    var cat = global.HomeReleaseCatalog;
    if (!cat || !cat.periods) return {};
    var periodId = cat.defaultPeriodId || 'june-2026';
    var entry = cat.periods[periodId];
    return (entry && entry.products) || {};
  }

  function getOptions() {
    var cat = global.HomeReleaseCatalog;
    var order = (cat && cat.productOrder) || [];
    var products = getCatalogProducts();
    return order
      .map(function (id) {
        var p = products[id];
        if (!p) return null;
        return { id: id, label: p.shortName || p.name, name: p.name || id };
      })
      .filter(Boolean);
  }

  function labelForId(id) {
    var products = getCatalogProducts();
    var p = products[id];
    return p ? p.shortName || p.name : id;
  }

  function formatProductIds(ids) {
    if (!ids || !ids.length) return '';
    return ids.map(labelForId).join(' · ');
  }

  function mapLegacyProductsString(str) {
    var text = String(str || '').trim();
    if (!text) return [];
    var parts = text.split(/[·,;|]/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    var options = getOptions();
    var ids = [];
    parts.forEach(function (part) {
      var lower = part.toLowerCase();
      var match = options.find(function (o) {
        return (
          o.label.toLowerCase() === lower ||
          o.name.toLowerCase() === lower ||
          o.label.toLowerCase().indexOf(lower) !== -1 ||
          lower.indexOf(o.label.toLowerCase()) !== -1
        );
      });
      if (match && ids.indexOf(match.id) === -1) ids.push(match.id);
    });
    return ids;
  }

  function normalizeProductIds(row) {
    if (!row) return [];
    if (Array.isArray(row.productIds) && row.productIds.length) {
      return row.productIds.slice();
    }
    if (row.products && typeof row.products === 'string') {
      return mapLegacyProductsString(row.products);
    }
    if (row.org && typeof row.org === 'string') {
      return mapLegacyProductsString(row.org);
    }
    return [];
  }

  function renderPickerGrid(container, selectedIds) {
    if (!container) return;
    var selected = selectedIds || [];
    var options = getOptions();
    container.innerHTML = options
      .map(function (o) {
        var checked = selected.indexOf(o.id) !== -1;
        return (
          '<label class="cc-product-option">' +
          '<input type="checkbox" name="productIds" value="' +
          o.id +
          '"' +
          (checked ? ' checked' : '') +
          '>' +
          '<span class="cc-product-option__label">' +
          o.label +
          '</span>' +
          '<span class="cc-product-option__hint">' +
          o.name +
          '</span></label>'
        );
      })
      .join('');
  }

  function readPickerValues(form) {
    if (!form) return [];
    var boxes = form.querySelectorAll('input[name="productIds"]:checked');
    var ids = [];
    boxes.forEach(function (b) {
      if (b.value) ids.push(b.value);
    });
    return ids;
  }

  global.HomeCommandProducts = {
    getOptions: getOptions,
    labelForId: labelForId,
    formatProductIds: formatProductIds,
    normalizeProductIds: normalizeProductIds,
    mapLegacyProductsString: mapLegacyProductsString,
    renderPickerGrid: renderPickerGrid,
    readPickerValues: readPickerValues,
  };
})(window);

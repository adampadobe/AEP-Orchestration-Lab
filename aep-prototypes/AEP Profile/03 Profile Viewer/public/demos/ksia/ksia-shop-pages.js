/**
 * KSIA shop & dine section — hub, duty-free, restaurants.
 */
(function () {
  'use strict';

  var data = window.KsiaMockData || {};

  function resolveHref(href) {
    if (window.KsiaChrome && typeof window.KsiaChrome.resolveHref === 'function') {
      return window.KsiaChrome.resolveHref(href);
    }
    return href;
  }

  function catalogHref(productId) {
    if (!productId) return '';
    return resolveHref('products/product.html?id=' + encodeURIComponent(productId));
  }

  function findCatalogProduct(productId) {
    return data.findKsiaProduct ? data.findKsiaProduct(productId) : null;
  }

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function renderStepper(mountId, steps) {
    var mount = document.getElementById(mountId);
    if (!mount || !steps || !steps.length) return;
    mount.innerHTML = steps
      .map(function (step, i) {
        var stateClass = step.state ? ' ksia-flights-step--' + step.state : '';
        var connector = i < steps.length - 1 ? '<span class="ksia-flights-step-connector" aria-hidden="true"></span>' : '';
        return (
          '<li class="ksia-flights-step' + stateClass + '">' +
          '<span class="ksia-flights-step-dot" aria-hidden="true"></span>' +
          '<span class="ksia-flights-step-label">' + step.label + '</span>' +
          connector +
          '</li>'
        );
      })
      .join('');
  }

  function renderServices(mountId, items) {
    var mount = document.getElementById(mountId);
    if (!mount || !items || !items.length) return;
    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-service-card">' +
          '<span class="ksia-flights-service-icon" aria-hidden="true">' + (item.icon || '&#9679;') + '</span>' +
          '<span class="ksia-flights-service-label">' + item.label + '</span>' +
          '</a></li>'
        );
      })
      .join('');
  }

  function renderSuggestions(mountId, items) {
    var mount = document.getElementById(mountId);
    if (!mount || !items || !items.length) return;
    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-assistant-row">' +
          '<span class="ksia-flights-assistant-icon" aria-hidden="true">' + (item.icon || '&#10022;') + '</span>' +
          '<span class="ksia-flights-assistant-body">' +
          '<span class="ksia-flights-assistant-title">' + item.title + '</span>' +
          '<span class="ksia-flights-assistant-desc">' + item.desc + '</span>' +
          '</span>' +
          '<span class="ksia-flights-assistant-arrow" aria-hidden="true">&rarr;</span>' +
          '</a></li>'
        );
      })
      .join('');
  }

  function initConcierge(prefix) {
    var copy = data.CONCIERGE_COPY;
    if (!copy) return;
    var title = document.getElementById(prefix + 'ConciergeTitle');
    var lead = document.getElementById(prefix + 'ConciergeLead');
    var cta = document.getElementById(prefix + 'ConciergeCta');
    if (title) title.textContent = copy.title;
    if (lead) lead.textContent = copy.lead;
    if (cta) {
      if (copy.cta) cta.textContent = copy.cta;
      cta.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('concierge-open');
        }
        cta.textContent = 'Concierge opened (mock)';
      });
    }
  }

  function initShopHub() {
    var hero = data.SHOP_DINE_HERO;
    if (hero) {
      var kicker = document.getElementById('ksiaShopHeroKicker');
      var lead = document.getElementById('ksiaShopHeroLead');
      var stage = document.getElementById('ksiaShopHeroStage');
      if (kicker) kicker.textContent = hero.kicker;
      if (lead) lead.textContent = hero.lead;
      if (stage) stage.textContent = hero.stage;
    }

    var catMount = document.getElementById('ksiaShopCategories');
    var categories = data.SHOP_DINE_CATEGORIES || [];
    if (catMount) {
      catMount.innerHTML = categories
        .map(function (c) {
          return (
            '<li><a href="' + resolveHref(c.href) + '" class="ksia-shop-category-card">' +
            '<span class="ksia-shop-category-icon" aria-hidden="true">' + c.icon + '</span>' +
            '<span class="ksia-shop-category-label">' + c.label + '</span>' +
            '<span class="ksia-shop-category-desc">' + c.desc + '</span></a></li>'
          );
        })
        .join('');
    }

    renderStepper('ksiaShopStepper', data.SHOP_JOURNEY_STEPS);

    var picksMount = document.getElementById('ksiaShopPersonalizedPicks');
    var picks = data.SHOP_PERSONALIZED_PICKS || [];
    if (picksMount) {
      picksMount.innerHTML = picks
        .map(function (p) {
          return (
            '<li><a href="' + resolveHref(p.href) + '" class="ksia-shop-pick-row">' +
            '<span class="ksia-shop-pick-badge">' + p.badge + '</span>' +
            '<span class="ksia-shop-pick-body">' +
            '<span class="ksia-shop-pick-title">' + p.title + '</span>' +
            '<span class="ksia-shop-pick-desc">' + p.desc + '</span></span>' +
            '<span class="ksia-shop-pick-arrow" aria-hidden="true">&rarr;</span></a></li>'
          );
        })
        .join('');
    }

    var filter = document.getElementById('ksiaShopTerminalFilter');
    var filters = data.SHOP_TERMINAL_FILTERS || [];
    if (filter && filters.length) {
      filter.innerHTML = filters
        .map(function (f, i) {
          return '<option value="' + f + '"' + (i === 0 ? ' selected' : '') + '>' + f + '</option>';
        })
        .join('');
      filter.addEventListener('change', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.shop.terminal.filter', { terminal: filter.value });
        }
      });
    }

    renderSuggestions('ksiaShopSuggestions', data.SHOP_ASSISTANT_SUGGESTIONS);
    renderServices('ksiaShopServices', data.SHOP_RELATED_SERVICES);
    initConcierge('ksiaShop');
  }

  function initDutyFree() {
    var collection = data.DUTY_FREE_COLLECTION;
    var collectionMount = document.getElementById('ksiaDutyFreeCollection');
    if (collectionMount && collection) {
      collectionMount.innerHTML =
        '<p class="ksia-board-assistant-lead">' + collection.lead + '</p>' +
        '<p class="ksia-transport-assistant-rec">' + collection.flight + ' · Gate ' + collection.gate + ' · ' + collection.window + '</p>';
    }

    var mount = document.getElementById('ksiaDutyFreeGrid');
    var offers = data.DUTY_FREE_OFFERS || [];
    var offerCatalogIds = data.KSIA_CATALOG_OFFER_IDS || {};

    function render(filterRecommended) {
      if (!mount) return;
      var list = filterRecommended
        ? offers.filter(function (o) { return o.recommended; })
        : offers;
      mount.innerHTML = list
        .map(function (o) {
          var badge = o.recommended
            ? '<span class="ksia-shop-offer-badge">Recommended for you</span>'
            : '';
          var productId = offerCatalogIds[o.id];
          var product = productId ? findCatalogProduct(productId) : null;
          var thumb = product
            ? '<img class="ksia-shop-offer-thumb" src="' + resolveHref(product.productImageURL) + '" alt="" loading="lazy">'
            : '';
          var nameHtml = product
            ? '<h3 class="ksia-shop-offer-name"><a href="' + catalogHref(productId) + '" class="ksia-shop-offer-name-link">' + o.name + '</a></h3>'
            : '<h3 class="ksia-shop-offer-name">' + o.name + '</h3>';
          return (
            '<article class="ksia-shop-offer-card' + (o.recommended ? ' ksia-shop-offer-card--recommended' : '') + '">' +
            badge +
            thumb +
            '<span class="ksia-shop-offer-category">' + o.category + '</span>' +
            nameHtml +
            '<p class="ksia-shop-offer-price">' + o.price + '</p>' +
            '<p class="ksia-shop-offer-note">' + o.note + '</p>' +
            (product ? '<a href="' + catalogHref(productId) + '" class="ksia-at-airport-inline-link ksia-shop-offer-details-link">View product &rarr;</a>' : '') +
            '<button type="button" class="ksia-btn ksia-btn-secondary ksia-shop-preorder-btn" data-offer-id="' + o.id + '">Pre-order</button>' +
            '</article>'
          );
        })
        .join('');

      mount.querySelectorAll('.ksia-shop-preorder-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.shop.dutyfree.preorder', { offer: btn.getAttribute('data-offer-id') });
          }
          btn.textContent = 'Added — collect at B12';
          btn.disabled = true;
        });
      });
    }

    render(false);

    var recToggle = document.getElementById('ksiaDutyFreeRecommendedOnly');
    if (recToggle) {
      recToggle.addEventListener('change', function () {
        render(recToggle.checked);
      });
    }

    var assistant = data.DUTY_FREE_ASSISTANT;
    if (assistant) {
      var title = document.getElementById('ksiaDutyFreeAssistantTitle');
      var lead = document.getElementById('ksiaDutyFreeAssistantLead');
      var wallet = document.getElementById('ksiaDutyFreeWalletLink');
      if (title) title.textContent = assistant.title;
      if (lead) lead.textContent = assistant.lead;
      if (wallet) wallet.href = resolveHref(assistant.walletHref);
    }

    var payBtn = document.getElementById('ksiaDutyFreePayBtn');
    if (payBtn) {
      payBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('wallet-pay-demo');
        }
        payBtn.textContent = 'Paid via wallet (mock)';
      });
    }

    var trustMount = document.getElementById('ksiaDutyFreeTrust');
    var trust = data.AIVC_TRUST_OUTCOMES || [];
    if (trustMount && trust.length) {
      trustMount.innerHTML = trust
        .slice(0, 2)
        .map(function (t) {
          return (
            '<div class="ksia-aivc-trust-stat">' +
            '<span class="ksia-aivc-trust-value">' + t.stat + '</span>' +
            '<span class="ksia-aivc-trust-label">' + t.label + '</span></div>'
          );
        })
        .join('');
    }
  }

  function initRestaurants() {
    var hint = data.RESTAURANTS_GATE_HINT;
    var hintMount = document.getElementById('ksiaRestaurantsGateHint');
    if (hintMount && hint) {
      hintMount.innerHTML =
        '<p class="ksia-board-assistant-lead">' + hint.lead + '</p>' +
        '<p class="ksia-transport-assistant-rec">Gate ' + hint.gate + ' · ' + hint.walkTime + '</p>';
    }

    var mount = document.getElementById('ksiaRestaurantsGrid');
    var restaurants = data.RESTAURANTS || [];
    var restaurantCatalogIds = data.KSIA_CATALOG_RESTAURANT_IDS || {};
    var cuisineFilter = document.getElementById('ksiaRestaurantCuisineFilter');
    var terminalFilter = document.getElementById('ksiaRestaurantTerminalFilter');

    var cuisines = data.RESTAURANT_CUISINES || [];
    if (cuisineFilter && cuisines.length) {
      cuisineFilter.innerHTML = cuisines
        .map(function (c, i) {
          return '<option value="' + c + '"' + (i === 0 ? ' selected' : '') + '>' + c + '</option>';
        })
        .join('');
    }

    var terminals = ['All terminals', 'Terminal 1', 'Terminal 2', 'Terminal 3'];
    if (terminalFilter) {
      terminalFilter.innerHTML = terminals
        .map(function (t, i) {
          return '<option value="' + t + '"' + (i === 0 ? ' selected' : '') + '>' + t + '</option>';
        })
        .join('');
    }

    function render() {
      if (!mount) return;
      var cuisine = cuisineFilter ? cuisineFilter.value : 'All cuisines';
      var terminal = terminalFilter ? terminalFilter.value : 'All terminals';
      var filtered = restaurants.filter(function (r) {
        if (cuisine !== 'All cuisines' && r.cuisine !== cuisine) return false;
        if (terminal !== 'All terminals' && r.terminal !== terminal) return false;
        return true;
      });

      mount.innerHTML = filtered.length
        ? filtered
            .map(function (r) {
              var featured = r.featured ? ' ksia-shop-restaurant-card--featured' : '';
              var productId = restaurantCatalogIds[r.name];
              var product = productId ? findCatalogProduct(productId) : null;
              var thumb = product
                ? '<img class="ksia-shop-offer-thumb" src="' + resolveHref(product.productImageURL) + '" alt="" loading="lazy">'
                : '';
              var nameHtml = product
                ? '<h3 class="ksia-shop-restaurant-name"><a href="' + catalogHref(productId) + '" class="ksia-shop-offer-name-link">' + r.name + '</a></h3>'
                : '<h3 class="ksia-shop-restaurant-name">' + r.name + '</h3>';
              return (
                '<article class="ksia-shop-restaurant-card' + featured + '">' +
                (r.featured ? '<span class="ksia-shop-pick-badge">Near your gate</span>' : '') +
                thumb +
                nameHtml +
                '<p class="ksia-shop-restaurant-meta">' + r.terminal + ' · ' + r.cuisine + '</p>' +
                '<p class="ksia-shop-restaurant-wait">Wait: <strong>' + r.waitTime + '</strong></p>' +
                '<p class="ksia-shop-restaurant-dietary">' + r.dietary + '</p>' +
                (product ? '<a href="' + catalogHref(productId) + '" class="ksia-at-airport-inline-link ksia-shop-offer-details-link">View product &rarr;</a>' : '') +
                '<button type="button" class="ksia-btn ksia-btn-secondary ksia-shop-reserve-btn">Reserve (mock)</button>' +
                '</article>'
              );
            })
            .join('')
        : '<p class="ksia-board-empty">No restaurants match your filters.</p>';

      mount.querySelectorAll('.ksia-shop-reserve-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.shop.restaurant.reserve', {});
          }
          btn.textContent = 'Reserved (mock)';
          btn.disabled = true;
        });
      });
    }

    render();
    if (cuisineFilter) cuisineFilter.addEventListener('change', render);
    if (terminalFilter) terminalFilter.addEventListener('change', render);

    var assistant = data.RESTAURANTS_ASSISTANT;
    if (assistant) {
      var title = document.getElementById('ksiaRestaurantsAssistantTitle');
      var lead = document.getElementById('ksiaRestaurantsAssistantLead');
      var wallet = document.getElementById('ksiaRestaurantsWalletLink');
      if (title) title.textContent = assistant.title;
      if (lead) lead.textContent = assistant.lead;
      if (wallet) wallet.href = resolveHref(assistant.walletHref);
    }
  }

  function init() {
    var id = pageId();
    if (id === 'shop-dine-hub') initShopHub();
    if (id === 'duty-free') initDutyFree();
    if (id === 'restaurants') initRestaurants();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

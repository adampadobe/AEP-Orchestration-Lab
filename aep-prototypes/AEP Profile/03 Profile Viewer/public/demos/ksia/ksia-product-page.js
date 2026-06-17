/**
 * KSIA product catalog — browse index and product detail (?id=).
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

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function productIdFromQuery() {
    try {
      return new URLSearchParams(window.location.search).get('id') || '';
    } catch (e) {
      return '';
    }
  }

  function renderStars(rating) {
    var n = Math.max(0, Math.min(5, Number(rating) || 0));
    var filled = '';
    var i;
    for (i = 0; i < 5; i += 1) {
      filled += i < n ? '\u2605' : '\u2606';
    }
    return filled;
  }

  function catalogCardHtml(product) {
    var href = resolveHref(product.productPageURL);
    var img = resolveHref(product.productImageURL);
    return (
      '<article class="ksia-product-catalog-card">' +
      '<a href="' + href + '" class="ksia-product-catalog-card-link">' +
      '<img class="ksia-product-catalog-thumb" src="' + img + '" alt="" loading="lazy" width="320" height="200">' +
      '<span class="ksia-product-catalog-category">' + product.category + '</span>' +
      '<h3 class="ksia-product-catalog-name">' + product.productName + '</h3>' +
      '<p class="ksia-product-catalog-price">' + (product.price || '') + '</p>' +
      '<span class="ksia-product-catalog-rating" aria-label="Rating ' + product.productRating + ' of 5">' +
      renderStars(product.productRating) +
      '</span></a></article>'
    );
  }

  function backLinkForCategory(category) {
    var map = {
      'duty-free': '../shop-dine/duty-free.html',
      dining: '../shop-dine/restaurants.html',
      parking: '../transport/parking.html',
      lounge: '../at-the-airport/services/lounges.html',
      transport: '../transport/index.html',
      retail: '../shop-dine/duty-free.html',
      'airport-service': '../at-the-airport/security.html',
      aivc: '../aivc/index.html',
    };
    return map[category] || '../shop-dine/index.html';
  }

  function primaryCtaLabel(category) {
    if (category === 'parking' || category === 'transport') return 'Book (mock)';
    if (category === 'dining' || category === 'lounge') return 'Reserve (mock)';
    if (category === 'aivc' || category === 'airport-service') return 'Activate (mock)';
    return 'Pre-order (mock)';
  }

  function initProductDetail() {
    var id = productIdFromQuery();
    var product = data.findKsiaProduct ? data.findKsiaProduct(id) : null;
    var detail = document.getElementById('ksiaProductDetail');
    var notFound = document.getElementById('ksiaProductNotFound');
    var relatedSection = document.getElementById('ksiaProductRelatedSection');

    if (!product) {
      if (detail) detail.hidden = true;
      if (notFound) notFound.hidden = false;
      document.title = 'Product not found — King Salman International Airport';
      return;
    }

    if (notFound) notFound.hidden = true;
    if (detail) detail.hidden = false;

    document.title = product.productName + ' — King Salman International Airport';

    var img = document.getElementById('ksiaProductImage');
    var name = document.getElementById('ksiaProductName');
    var desc = document.getElementById('ksiaProductDescription');
    var price = document.getElementById('ksiaProductPrice');
    var category = document.getElementById('ksiaProductCategory');
    var rating = document.getElementById('ksiaProductRating');
    var code = document.getElementById('ksiaProductId');
    var crumb = document.getElementById('ksiaProductBreadcrumbCurrent');
    var back = document.getElementById('ksiaProductBackLink');
    var cta = document.getElementById('ksiaProductPrimaryCta');

    if (img) {
      img.src = resolveHref(product.productImageURL);
      img.alt = product.productName;
    }
    if (name) name.textContent = product.productName;
    if (desc) desc.textContent = product.productDescription;
    if (price) price.textContent = product.price || '';
    if (category) category.textContent = product.category;
    if (rating) {
      rating.textContent = renderStars(product.productRating);
      rating.setAttribute('aria-label', 'Rating ' + product.productRating + ' out of 5');
    }
    if (code) code.textContent = product.productID;
    if (crumb) crumb.textContent = product.productName;
    if (back) {
      back.href = resolveHref(backLinkForCategory(product.category));
      back.textContent =
        product.category === 'parking'
          ? 'Back to parking'
          : product.category === 'dining'
            ? 'Back to restaurants'
            : product.category === 'lounge'
              ? 'Back to lounges'
              : 'Back to shop';
    }
    if (cta) {
      cta.textContent = primaryCtaLabel(product.category);
      cta.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.catalog.product.action', {
            productId: product.productID,
            category: product.category,
          });
        }
        cta.textContent = 'Added (mock)';
        cta.disabled = true;
      });
    }

    var catalogLink = document.getElementById('ksiaProductCatalogLink');
    if (catalogLink) catalogLink.href = resolveHref('products/index.html');

    var catalog = data.KSIA_PRODUCT_CATALOG || [];
    var related = catalog
      .filter(function (p) {
        return p.category === product.category && p.productID !== product.productID;
      })
      .slice(0, 3);
    var relatedMount = document.getElementById('ksiaProductRelated');
    if (relatedMount && related.length) {
      relatedMount.innerHTML = related.map(catalogCardHtml).join('');
      if (relatedSection) relatedSection.hidden = false;
    }
  }

  function initProductCatalog() {
    var catalog = data.KSIA_PRODUCT_CATALOG || [];
    var filter = document.getElementById('ksiaCatalogCategoryFilter');
    var mount = document.getElementById('ksiaCatalogGrid');
    if (!mount) return;

    var categories = ['All categories'];
    catalog.forEach(function (p) {
      if (categories.indexOf(p.category) === -1) categories.push(p.category);
    });

    if (filter) {
      filter.innerHTML = categories
        .map(function (c, i) {
          return '<option value="' + c + '"' + (i === 0 ? ' selected' : '') + '>' + c + '</option>';
        })
        .join('');
    }

    function render() {
      var selected = filter ? filter.value : 'All categories';
      var list =
        selected === 'All categories'
          ? catalog
          : catalog.filter(function (p) {
              return p.category === selected;
            });
      mount.innerHTML = list.length
        ? list.map(catalogCardHtml).join('')
        : '<p class="ksia-board-empty">No products in this category.</p>';
    }

    render();
    if (filter) {
      filter.addEventListener('change', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.catalog.filter', { category: filter.value });
        }
        render();
      });
    }
  }

  function init() {
    var id = pageId();
    if (id === 'product-detail') initProductDetail();
    if (id === 'product-catalog') initProductCatalog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

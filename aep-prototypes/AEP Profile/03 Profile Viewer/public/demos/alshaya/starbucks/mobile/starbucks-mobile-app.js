/**
 * Starbucks UAE mobile app — navigation, mock data, postMessage bridge.
 */
(function () {
  'use strict';

  var PAGE_ID = document.body && document.body.getAttribute('data-starbucks-mobile-page');
  var data = window.StarbucksMockData || {};

  function postEvent(type, publicObj, viewName) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: 'starbucks-mobile-lab',
            type: 'starbucks-experience-event',
            payload: {
              eventType: type,
              public: publicObj || {},
              viewName: viewName || 'Starbucks mobile',
              viewUrl: location.href.split('?')[0],
              channel: 'Mobile App',
            },
          },
          '*',
        );
      }
    } catch (_e) {
      /* noop */
    }
  }

  function renderTabBar() {
    var bar = document.getElementById('sbMobileTabBar');
    if (!bar) return;
    var tabs = [
      { id: 'home', label: 'Home', href: 'index.html', icon: '&#9733;' },
      { id: 'order', label: 'Order', href: 'order.html', icon: '&#9749;' },
      { id: 'rewards', label: 'Rewards', href: 'rewards.html', icon: '&#127873;' },
      { id: 'stores', label: 'Stores', href: 'stores.html', icon: '&#128205;' },
    ];
    bar.innerHTML = tabs
      .map(function (tab) {
        var active = tab.id === PAGE_ID ? ' sb-mobile-tab--active' : '';
        var qs = location.search || '';
        return (
          '<a class="sb-mobile-tab' +
          active +
          '" href="' +
          tab.href +
          qs +
          '"><span aria-hidden="true">' +
          tab.icon +
          '</span><span>' +
          tab.label +
          '</span></a>'
        );
      })
      .join('');
  }

  function renderHome() {
    var stars = document.getElementById('sbMobileStars');
    if (stars) stars.textContent = '125 Stars · Green tier';
    var actions = document.getElementById('sbMobileQuickActions');
    if (!actions) return;
    var items = [
      { label: 'Order ahead', type: 'starbucks.mobile.order.start' },
      { label: 'Scan in store', type: 'starbucks.mobile.scan' },
      { label: 'Reload card', type: 'starbucks.mobile.card.reload' },
    ];
    actions.innerHTML = items
      .map(function (item) {
        return (
          '<button type="button" class="sb-mobile-action" data-event="' +
          item.type +
          '">' +
          item.label +
          '</button>'
        );
      })
      .join('');
    actions.querySelectorAll('[data-event]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        postEvent(btn.getAttribute('data-event'), { source: 'home' });
      });
    });
  }

  function renderOrder() {
    var list = document.getElementById('sbMobileOrderList');
    if (!list || !data.orderItems) return;
    list.innerHTML = data.orderItems
      .map(function (item) {
        var thumb = item.image
          ? '<img class="sb-mobile-list-thumb" src="../' + item.image + '" alt="" loading="lazy">'
          : '';
        return (
          '<li class="sb-mobile-list-item">' +
          thumb +
          '<div class="sb-mobile-list-body"><strong>' +
          item.name +
          '</strong><br><span class="sb-mobile-muted">' +
          item.modifiers +
          '</span></div><span>' +
          item.price +
          '</span></li>'
        );
      })
      .join('');
    var checkout = document.getElementById('sbMobileCheckoutBtn');
    if (checkout) {
      checkout.addEventListener('click', function () {
        postEvent('starbucks.mobile.order.checkout', { itemCount: data.orderItems.length });
      });
    }
  }

  function renderRewards() {
    var host = document.getElementById('sbMobileRewardsTiers');
    if (!host || !data.rewardsTiers) return;
    host.innerHTML = data.rewardsTiers
      .map(function (tier) {
        var icon = tier.image
          ? '<img class="sb-mobile-card-icon" src="../' + tier.image + '" alt="" loading="lazy">'
          : '';
        return (
          '<article class="sb-mobile-card">' +
          icon +
          '<div class="sb-mobile-card-body"><h3>' +
          tier.label +
          '</h3><p>' +
          tier.stars +
          ' — ' +
          tier.perk +
          '</p></div></article>'
        );
      })
      .join('');
  }

  function renderStores() {
    var host = document.getElementById('sbMobileStoreList');
    if (!host || !data.stores) return;
    host.innerHTML = data.stores
      .map(function (store) {
        return (
          '<article class="sb-mobile-card sb-mobile-store" data-store-id="' +
          store.id +
          '"><h3>' +
          store.name +
          '</h3><p class="sb-mobile-muted">' +
          store.city +
          ' · ' +
          store.hours +
          '</p></article>'
        );
      })
      .join('');
    host.querySelectorAll('.sb-mobile-store').forEach(function (card) {
      card.addEventListener('click', function () {
        postEvent('starbucks.mobile.store.select', { storeId: card.getAttribute('data-store-id') });
      });
    });
  }

  renderTabBar();
  if (PAGE_ID === 'home') renderHome();
  if (PAGE_ID === 'order') renderOrder();
  if (PAGE_ID === 'rewards') renderRewards();
  if (PAGE_ID === 'stores') renderStores();

  postEvent('starbucks.mobile.page.view', { pageId: PAGE_ID || 'home' }, 'Starbucks mobile — ' + (PAGE_ID || 'home'));

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'starbucks-mobile-lab-parent') return;
    if (ev.data.type === 'sdk-injected') {
      var hint = document.getElementById('sbMobileSdkHint');
      if (hint) hint.hidden = true;
    }
  });
})();

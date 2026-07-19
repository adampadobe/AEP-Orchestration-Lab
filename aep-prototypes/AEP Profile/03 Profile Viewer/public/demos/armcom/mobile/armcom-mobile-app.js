/**
 * Arm mobile app — navigation, notifications, postMessage bridge.
 */
(function () {
  'use strict';

  var PAGE_ID = document.body && document.body.getAttribute('data-armcom-mobile-page');
  var TABS = [
    { id: 'home', label: 'Home', href: 'index.html', icon: '⌂' },
    { id: 'docs', label: 'Docs', href: 'docs.html', icon: '📄' },
    { id: 'cloud-ai', label: 'Cloud AI', href: 'cloud-ai.html', icon: '☁' },
    { id: 'notifications', label: 'Alerts', href: 'notifications.html', icon: '🔔' },
  ];

  function isSimMobile() {
    return /[?&]aepSimMobile=1/.test(window.location.search);
  }

  function postToParent(type, payload) {
    if (!isSimMobile()) return;
    try {
      window.parent.postMessage(
        {
          source: 'armcom-mobile-lab',
          type: type,
          payload: payload || {},
        },
        '*',
      );
    } catch (_e) {
      /* ignore */
    }
  }

  function sendPageView() {
    var names = {
      home: 'Arm Developer home',
      docs: 'Arm Developer docs',
      'cloud-ai': 'Arm Cloud AI mobile',
      notifications: 'Arm notifications',
    };
    postToParent('armcom-experience-event', {
      eventType: 'armcom.mobile.page.view',
      viewName: names[PAGE_ID] || 'Arm mobile',
      viewUrl: window.location.href.split('?')[0],
      channel: 'Mobile App',
      public: {
        pageName: PAGE_ID,
        topic: 'cloud-ai',
        siteId: 'developer.arm.com',
      },
    });
  }

  function renderTabBar() {
    var bar = document.getElementById('armcomMobileTabBar');
    if (!bar) return;
    bar.innerHTML = TABS.map(function (tab) {
      var active = tab.id === PAGE_ID ? ' armcom-mobile-tab--active' : '';
      var href = tab.href + (isSimMobile() ? '?aepSimMobile=1' : '');
      return (
        '<a href="' +
        href +
        '" class="armcom-mobile-tab' +
        active +
        '" aria-current="' +
        (tab.id === PAGE_ID ? 'page' : 'false') +
        '">' +
        '<span class="armcom-mobile-tab-icon" aria-hidden="true">' +
        tab.icon +
        '</span>' +
        '<span class="armcom-mobile-tab-label">' +
        tab.label +
        '</span></a>'
      );
    }).join('');
  }

  function wireNotificationClicks() {
    function linkedInMockHref() {
      return '../../../social/linkedin.html?from=mobile';
    }

    function openLinkedInDeepLink(el) {
      postToParent('armcom-experience-event', {
        eventType: 'armcom.push.clicked',
        viewName: 'Paid social retarget',
        channel: 'Mobile App',
        public: {
          campaign: el.getAttribute('data-armcom-push'),
          topic: 'cloud-ai',
          destination: 'linkedin',
        },
      });
      var target = linkedInMockHref();
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = target;
          return;
        }
      } catch (_e) {
        /* ignore */
      }
      window.location.href = target;
    }

    document.querySelectorAll('[data-armcom-push]').forEach(function (el) {
      el.addEventListener('click', function () {
        var destination = el.getAttribute('data-armcom-destination') || 'linkedin';
        if (destination === 'linkedin') {
          openLinkedInDeepLink(el);
          return;
        }
        postToParent('armcom-experience-event', {
          eventType: 'armcom.push.clicked',
          viewName: 'Paid social retarget',
          channel: 'Mobile App',
          public: {
            campaign: el.getAttribute('data-armcom-push'),
            topic: 'cloud-ai',
            destination: destination,
          },
        });
      });
      el.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        el.click();
      });
    });
  }

  function init() {
    renderTabBar();
    sendPageView();
    wireNotificationClicks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

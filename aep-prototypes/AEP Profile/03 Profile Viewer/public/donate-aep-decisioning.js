/**
 * Donate page — request AJO / Offer Decisioning propositions via Experience Platform Web SDK (alloy).
 * Requires Launch to load the Web SDK extension with a datastream that has Offer Decisioning enabled.
 *
 * @see https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/personalization/offer-decisioning/offer-decisioning-overview
 * @see https://experienceleague.adobe.com/en/docs/experience-platform/collection/use-cases/personalization/render-auto-pers-content
 */
(function () {
  const ALLOY_POLL_MS = 100;
  const ALLOY_MAX_WAIT_MS = 20000;
  /** @type {MutationObserver | null} */
  let heroObserver = null;

  function getDecisionScopesFromBanner() {
    const el = document.querySelector('.hero-banner[data-aep-decision-scope]');
    const raw = (el && el.getAttribute('data-aep-decision-scope')) || 'hero-banner';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function getAlloy() {
    return typeof window.alloy === 'function' ? window.alloy : null;
  }

  function waitForAlloy(callback) {
    const alloyNow = getAlloy();
    if (alloyNow) {
      callback(alloyNow);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(function () {
      const a = getAlloy();
      if (a) {
        window.clearInterval(id);
        callback(a);
        return;
      }
      if (Date.now() - started > ALLOY_MAX_WAIT_MS) {
        window.clearInterval(id);
        if (window.console && console.warn) {
          console.warn(
            '[donate-aep-decisioning] alloy() was not found. Confirm the AEP Web SDK extension is in your Launch property and loads on this page.',
          );
        }
        callback(null);
      }
    }, ALLOY_POLL_MS);
  }

  function watchHeroForDomInjection(banner, inner) {
    if (!banner || !inner) return;
    if (heroObserver) {
      heroObserver.disconnect();
      heroObserver = null;
    }
    const mo = new MutationObserver(function () {
      if (!inner.querySelector('.hero-banner-placeholder')) {
        banner.classList.add('hero-banner--aep-rendered');
        mo.disconnect();
        heroObserver = null;
      }
    });
    heroObserver = mo;
    mo.observe(inner, { childList: true, subtree: true });
    window.setTimeout(function () {
      if (heroObserver === mo) {
        mo.disconnect();
        heroObserver = null;
      }
    }, 15000);
  }

  function requestOffers(alloy) {
    const scopes = getDecisionScopesFromBanner();
    if (!scopes.length) return;

    const banner = document.querySelector('.hero-banner.donate-hero-banner-aep');
    const inner = document.getElementById('heroBannerInner');
    watchHeroForDomInjection(banner, inner);

    alloy('sendEvent', {
      renderDecisions: true,
      personalization: {
        decisionScopes: scopes,
      },
      xdm: {
        eventType: 'web.webpagedetails.pageViews',
        web: {
          webPageDetails: {
            URL: window.location.href || '',
            name: document.title || '',
          },
        },
      },
    })
      .then(function (result) {
        if (window.localStorage.getItem('aepDecisioningDebug') === '1' && window.console) {
          console.log('[donate-aep-decisioning] sendEvent result', result);
        }
      })
      .catch(function (err) {
        if (window.console && console.warn) {
          console.warn('[donate-aep-decisioning] sendEvent failed', err);
        }
      });
  }

  function run() {
    waitForAlloy(function (alloy) {
      if (alloy) requestOffers(alloy);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.addEventListener('aep-donate-profile-updated', function () {
    waitForAlloy(function (alloy) {
      if (alloy) requestOffers(alloy);
    });
  });
})();

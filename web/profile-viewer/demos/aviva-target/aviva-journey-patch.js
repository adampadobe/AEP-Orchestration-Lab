/**
 * Aviva car insurance demo — local click-through between saved HTML journey pages.
 * Navigates the top-level browser to hosted paths under /profile-viewer/demos/aviva-target/
 * (breaks out of the lab iframe so the address bar matches production-like URLs).
 */
(function () {
  'use strict';

  var REG_KEY = 'avivaDemoRegistration';
  var DEFAULT_REG = 'MT16CSV';
  var DEMO_ROOT = '/profile-viewer/demos/aviva-target/';
  var MOTOR = 'quote/Direct/Motor/';

  function demoUrl(relativePath) {
    return DEMO_ROOT + String(relativePath || '').replace(/^\//, '');
  }

  function go(relativePath) {
    var url = demoUrl(relativePath);
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch (e) {}
    window.location.href = url;
  }

  function motorSlug() {
    var path = (location.pathname || '').toLowerCase();
    if (path.indexOf('/quote/direct/motor/vehicle-details') !== -1) return 'vehicle-details';
    if (path.indexOf('/quote/direct/motor/driver-details') !== -1) return 'driver-details';
    if (path.indexOf('/quote/direct/motor/additional-information') !== -1) return 'additional-information';
    if (path.indexOf('/quote/direct/motor/driver-quote') !== -1) return 'driver-quote';
    if (path.indexOf('/quote/direct/motor/quote-details') !== -1) return 'driver-quote';
    return '';
  }

  function currentPage() {
    var slug = motorSlug();
    if (slug) return slug;
    var name = (location.pathname || '').split('/').pop() || 'index.html';
    return name.replace(/^\.\//, '').replace(/\.html$/i, '');
  }

  function normaliseReg(value) {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
  }

  function formatPlate(value) {
    var reg = normaliseReg(value);
    if (reg.length <= 4) return reg;
    return reg.slice(0, 4) + ' ' + reg.slice(4);
  }

  function readReg() {
    try {
      return sessionStorage.getItem(REG_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function writeReg(value) {
    try {
      sessionStorage.setItem(REG_KEY, normaliseReg(value));
    } catch (e) {}
  }

  function applyStoredRegistration() {
    var plate = readReg() || DEFAULT_REG;
    document.querySelectorAll('.registration-plate').forEach(function (el) {
      el.textContent = formatPlate(plate);
    });

    var regInput = document.getElementById('RegistrationNumber');
    if (regInput && !regInput.value) regInput.value = formatPlate(plate);

    var landingReg = document.getElementById('car-registration');
    if (landingReg && !landingReg.value) landingReg.value = formatPlate(plate);
  }

  function intercept(el, handler) {
    if (!el || el.dataset.avivaDemoBound === '1') return;
    el.dataset.avivaDemoBound = '1';
    el.addEventListener('click', handler, true);
  }

  function interceptSubmit(el, handler) {
    if (!el || el.dataset.avivaDemoBound === '1') return;
    el.dataset.avivaDemoBound = '1';
    el.addEventListener('submit', handler, true);
  }

  function buttonText(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isJourneyBackLink(el) {
    if (!el || el.tagName !== 'A') return false;
    if (el.getAttribute('data-dd-link') === 'back') return true;
    if (!el.classList.contains('a-button-icon--previous')) return false;
    return buttonText(el) === 'Back';
  }

  function wireBackLinks(backRelativePath) {
    if (!backRelativePath) return;
    document.querySelectorAll('a').forEach(function (el) {
      if (!isJourneyBackLink(el)) return;
      intercept(el, function (event) {
        event.preventDefault();
        event.stopPropagation();
        go(backRelativePath);
      });
    });
  }

  function wireLanding() {
    var regInput = document.getElementById('car-registration');

    document.querySelectorAll('button, [type="submit"]').forEach(function (el) {
      if (buttonText(el) !== 'Get a new quote') return;
      intercept(el, function (event) {
        event.preventDefault();
        event.stopPropagation();
        var plate = regInput ? normaliseReg(regInput.value) : '';
        if (!plate) {
          if (regInput) regInput.focus();
          return;
        }
        writeReg(plate);
        go(MOTOR + 'vehicle-details.html');
      });
    });

    document.querySelectorAll('a').forEach(function (anchor) {
      var text = (anchor.textContent || '').toLowerCase();
      if (text.indexOf("don't know the registration") === -1) return;
      intercept(anchor, function (event) {
        event.preventDefault();
        go('step1-registration.html');
      });
    });
  }

  function wireRegistration() {
    var regInput = document.getElementById('RegistrationNumber');
    var findBtn = document.getElementById('FindMyVehicleButton');
    if (!findBtn) return;

    intercept(findBtn, function (event) {
      event.preventDefault();
      event.stopPropagation();
      var plate = regInput ? normaliseReg(regInput.value) : '';
      if (!plate) {
        if (regInput) regInput.focus();
        return;
      }
      writeReg(plate);
      go(MOTOR + 'vehicle-details.html');
    });

    var form = findBtn.closest('form');
    if (form) {
      interceptSubmit(form, function (event) {
        event.preventDefault();
        findBtn.click();
      });
    }

    wireBackLinks('index.html');
  }

  function wireNextButton(nextRelativePath) {
    var nextBtn = document.getElementById('NextButton');
    if (nextBtn) {
      intercept(nextBtn, function (event) {
        event.preventDefault();
        event.stopPropagation();
        go(nextRelativePath);
      });
    }

    document.querySelectorAll('button, a.a-button').forEach(function (el) {
      var text = buttonText(el);
      if (
        text.indexOf('Continue to driver details') === -1 &&
        text.indexOf('Continue to additional information') === -1 &&
        text.indexOf('Continue to your price') === -1
      ) {
        return;
      }
      intercept(el, function (event) {
        event.preventDefault();
        event.stopPropagation();
        go(nextRelativePath);
      });
    });

    var form = nextBtn && nextBtn.closest('form');
    if (form) {
      interceptSubmit(form, function (event) {
        event.preventDefault();
        go(nextRelativePath);
      });
    }
  }

  function init() {
    applyStoredRegistration();

    switch (currentPage()) {
      case 'index':
      case 'index.html':
        wireLanding();
        break;
      case 'step1-registration':
      case 'step1-registration.html':
        wireRegistration();
        break;
      case 'vehicle-details':
      case 'step1-vehicle-details':
      case 'step1-vehicle-details.html':
        wireNextButton(MOTOR + 'driver-details.html');
        wireBackLinks('index.html');
        break;
      case 'driver-details':
        wireNextButton(MOTOR + 'additional-information.html');
        wireBackLinks(MOTOR + 'vehicle-details.html');
        break;
      case 'additional-information':
        wireNextButton(MOTOR + 'driver-quote.html');
        wireBackLinks(MOTOR + 'driver-details.html');
        break;
      case 'driver-quote':
        wireBackLinks(MOTOR + 'additional-information.html');
        break;
      default:
        break;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

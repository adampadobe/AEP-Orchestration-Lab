/**
 * Aviva car insurance demo — local click-through between saved HTML journey pages.
 * Keeps registration in sessionStorage so the plate carries through the quote flow.
 */
(function () {
  'use strict';

  var REG_KEY = 'avivaDemoRegistration';
  var DEFAULT_REG = 'MT16CSV';

  function currentPage() {
    var path = location.pathname || '';
    if (path.indexOf('/quote/Direct/Motor/quote-details') !== -1 || path.indexOf('quote-details.html') !== -1) {
      return 'quote-details.html';
    }
    var name = path.split('/').pop() || 'index.html';
    return name.replace(/^\.\//, '');
  }

  function go(href) {
    window.location.href = href;
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
        go('step1-vehicle-details.html');
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
      go('step1-vehicle-details.html');
    });

    var form = findBtn.closest('form');
    if (form) {
      interceptSubmit(form, function (event) {
        event.preventDefault();
        findBtn.click();
      });
    }
  }

  function wireNextButton(nextHref) {
    var nextBtn = document.getElementById('NextButton');
    if (nextBtn) {
      intercept(nextBtn, function (event) {
        event.preventDefault();
        event.stopPropagation();
        go(nextHref);
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
        go(nextHref);
      });
    });

    var form = nextBtn && nextBtn.closest('form');
    if (form) {
      interceptSubmit(form, function (event) {
        event.preventDefault();
        go(nextHref);
      });
    }
  }

  function init() {
    applyStoredRegistration();

    switch (currentPage()) {
      case 'index.html':
        wireLanding();
        break;
      case 'step1-registration.html':
        wireRegistration();
        break;
      case 'step1-vehicle-details.html':
        wireNextButton('step2-driver.html');
        break;
      case 'step2-driver.html':
        wireNextButton('step3-additional.html');
        break;
      case 'step3-additional.html':
        wireNextButton('quote/Direct/Motor/quote-details.html');
        break;
      case 'quote-details.html':
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

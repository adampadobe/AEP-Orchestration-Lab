(function sainsburysDemoSite() {
  'use strict';

  const menuButton = document.querySelector('.menu-button');
  const nav = document.getElementById('primary-nav');
  const toast = document.querySelector('.toast');
  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  if (menuButton && nav) {
    menuButton.addEventListener('click', function () {
      const expanded = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('primary-nav--open', !expanded);
    });
  }

  const search = document.querySelector('.search');
  if (search) {
    search.addEventListener('submit', function (event) {
      event.preventDefault();
      const input = search.querySelector('input');
      const term = input ? input.value.trim() : '';
      showToast(term ? 'Searching for “' + term + '” in this demo' : 'Enter a product to search');
    });
  }

  document.querySelectorAll('[data-demo-action]').forEach(function (control) {
    control.addEventListener('click', function () {
      showToast(control.getAttribute('data-demo-action') + ' selected — demo interaction');
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (menuButton && nav) {
        menuButton.setAttribute('aria-expanded', 'false');
        nav.classList.remove('primary-nav--open');
      }
    });
  });
})();

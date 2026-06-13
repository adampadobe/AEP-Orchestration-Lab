/**
 * KSIA info pages — about, media, contact.
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

  function initAbout() {
    var content = data.ABOUT_CONTENT;
    if (!content) return;

    var lead = document.getElementById('ksiaAboutVisionLead');
    if (lead) lead.textContent = content.visionLead;

    var statsMount = document.getElementById('ksiaAboutStats');
    if (statsMount && content.stats) {
      statsMount.innerHTML = content.stats
        .map(function (s) {
          return (
            '<div class="ksia-about-stat">' +
            '<span class="ksia-about-stat-value">' + s.value + '</span>' +
            '<span class="ksia-about-stat-label">' + s.label + '</span></div>'
          );
        })
        .join('');
    }

    var pillarsMount = document.getElementById('ksiaAboutPillars');
    if (pillarsMount && content.pillars) {
      pillarsMount.innerHTML = content.pillars
        .map(function (p) {
          return (
            '<article class="ksia-about-pillar">' +
            '<h3 class="ksia-about-pillar-title">' + p.title + '</h3>' +
            '<p class="ksia-about-pillar-desc">' + p.desc + '</p></article>'
          );
        })
        .join('');
    }

    var aivc = data.ABOUT_AIVC_SECTION;
    if (aivc) {
      var aivcTitle = document.getElementById('ksiaAboutAivcTitle');
      var aivcLead = document.getElementById('ksiaAboutAivcLead');
      var aivcCta = document.getElementById('ksiaAboutAivcCta');
      if (aivcTitle) aivcTitle.textContent = aivc.title;
      if (aivcLead) aivcLead.textContent = aivc.lead;
      if (aivcCta) {
        aivcCta.textContent = aivc.cta;
        aivcCta.href = resolveHref(aivc.href);
      }
    }

    initConcierge('ksiaAbout');
  }

  function initMedia() {
    var mount = document.getElementById('ksiaMediaList');
    var items = data.MEDIA_ITEMS || [];
    if (mount) {
      mount.innerHTML = items
        .map(function (m) {
          return (
            '<article class="ksia-media-item">' +
            '<span class="ksia-media-tag">' + m.tag + '</span>' +
            '<time class="ksia-media-date" datetime="' + m.date + '">' + m.date + '</time>' +
            '<h3 class="ksia-media-title">' + m.title + '</h3>' +
            '<button type="button" class="ksia-btn ksia-btn-secondary ksia-media-download-btn">Download assets (mock)</button>' +
            '</article>'
          );
        })
        .join('');

      mount.querySelectorAll('.ksia-media-download-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.media.download', {});
          }
          btn.textContent = 'Requested (mock)';
        });
      });
    }

    var assetsMount = document.getElementById('ksiaMediaBrandAssets');
    var assets = data.MEDIA_BRAND_ASSETS || [];
    if (assetsMount) {
      assetsMount.innerHTML = assets
        .map(function (a) {
          return (
            '<article class="ksia-about-pillar">' +
            '<img src="' + a.image + '" alt="" style="width:100%;max-height:120px;object-fit:contain;margin-bottom:12px;border-radius:8px;background:var(--ksia-white)">' +
            '<h3 class="ksia-about-pillar-title">' + a.title + '</h3>' +
            '<p class="ksia-about-pillar-desc">' + a.desc + '</p>' +
            '<button type="button" class="ksia-btn ksia-btn-secondary ksia-media-asset-btn" style="margin-top:12px">Download pack (mock)</button>' +
            '</article>'
          );
        })
        .join('');

      assetsMount.querySelectorAll('.ksia-media-asset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.media.asset.download', {});
          }
          btn.textContent = 'Requested (mock)';
        });
      });
    }

    initConcierge('ksiaMedia');
  }

  function initContact() {
    var mount = document.getElementById('ksiaContactChannels');
    var channels = data.CONTACT_CHANNELS || [];
    if (mount) {
      mount.innerHTML = channels
        .map(function (c) {
          return (
            '<div class="ksia-contact-channel">' +
            '<span class="ksia-contact-channel-label">' + c.label + '</span>' +
            '<span class="ksia-contact-channel-value">' + c.value + '</span>' +
            '<span class="ksia-contact-channel-hours">' + c.hours + '</span></div>'
          );
        })
        .join('');
    }

    var form = document.getElementById('ksiaContactForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.contact.submit', {});
        }
        var btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.textContent = 'Message sent (mock)';
          btn.disabled = true;
        }
      });
    }

    initConcierge('ksiaContact');
  }

  function init() {
    var id = pageId();
    if (id === 'about') initAbout();
    if (id === 'media') initMedia();
    if (id === 'contact') initContact();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

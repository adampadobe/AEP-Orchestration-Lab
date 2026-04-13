/**
 * AEP & Apps — slide deck viewer (content reconstructed from AEP Architecture.pptx).
 */
(function () {
  'use strict';

  var slides = [
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Adobe Experience Platform is a powerful, flexible, open, and centralized data foundation that collects, standardizes, governs, applies AI insights to, and unifies data to offer thoughtful and relevant digital customer experiences.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Four applications are natively built on Experience Platform: Adobe Real-Time Customer Data Platform (RTCDP), Journey Optimizer (AJO), Customer Journey Analytics (CJA), and Adobe Mix Modeler.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Adobe Experience Platform can ingest data from almost any source needed to power a customer experience—web and mobile behavioral data, Adobe Experience Cloud applications, third-party systems, cloud-based storage or databases, enterprise data sources like CRMs, ETL tools, external data warehouses, and more.',
        'Experience Platform ingests data from sources either by streaming or batch.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Customer experiences are more impactful when they happen in the context of each customer’s unique journey—taking into account when, where, how, and why they may be engaging with you.',
        'Experience Platform supports streaming data from your data sources using either an SDK or an API. That data updates the Real-Time Customer Profile in real time, which in turn can support real-time experiences and personalization.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'You can batch upload data on a one-time or periodic basis using an API or a pre-built connector. Batch ingested data gets loaded into the Experience Platform Data Lake and enriches the Real-Time Customer Profile once daily.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'You can stream data directly into Experience Platform or via the Edge Network, a globally distributed network of servers that minimizes latency for sending data to Experience Platform and delivering content by using a server physically close to the customer.',
        'Tags expedite and simplify your Experience Platform deployment. It gives users a simple way to deploy and manage all the analytics, marketing, and advertising tags necessary to power relevant customer experiences.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Streaming data enriches the Real-Time Customer Profile, unlocking your ability to do real-time personalization, journey orchestration, and activation at destinations.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Identity Graph is a collection of a single customer’s identities across your data sources—their CRM ID, email ID, support ID, and others. Experience Platform’s approach to identity resolution is highly accurate, so it supports delivering customers extremely relevant messaging.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Experience Platform provides marketer-friendly rules-based segmentation capabilities. As streaming data streams in and attaches to a profile, the rules are applied to immediately qualify or disqualify individuals for segments. In comparison, segmentation is only applied to batch data once a day.',
        'Audience Composition is a flexible way to manage segments in Experience Platform that can be used alongside the rules-based segmentation capability.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Federated Audience Composition allows you to import third-party audiences from data warehouses into Experience Platform so that you can build and enrich audiences with these third-party audiences.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Query Service and Intelligence and AI are additional capabilities that can offer your business value by helping you answer questions based on data in the Data Lake.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'You can take select data out of the Data Lake to any external destination that accepts information from the Data Lake—for example, to use in a third-party data visualization product like Tableau.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Because Experience Platform is an API-oriented system, you can set it up to provide Alerts that tell you when something went wrong or needs attention.',
        'Audit Logs will tell you who logged into Experience Platform, the actions they took, and the time they took those actions—all important for governance.',
        'Granular Access Controls allow you to restrict who has access to what so that everyone has the exact right level of access for their role.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'A sandbox creates a complete Experience Platform environment. Sandboxing allows you to create separate development and production environments, separate environments to handle highly sensitive data, or separate environments for subsidiaries if you are a multi-business company.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Real-Time Customer Data Platform, Journey Optimizer, Customer Journey Analytics, and Mix Modeler are all applications natively built on Experience Platform.',
        'Each has different access to the Real-Time Customer Profile and Data Lake based on use cases solved for by each product and the entitlements of specific packages purchased.',
      ],
    },
    {
      title: 'Adobe Experience Platform & Applications',
      paras: [
        'Journey Optimizer uses the Real-Time Customer Profile to personalize customer engagement for inbound and outbound channels.',
      ],
    },
  ];

  var idx = 0;
  var titleEl;
  var bodyEl;
  var counterEl;
  var liveEl;

  function render() {
    if (!titleEl || !bodyEl) return;
    var s = slides[idx];
    titleEl.textContent = s.title;
    bodyEl.innerHTML = '';
    s.paras.forEach(function (p) {
      var el = document.createElement('p');
      el.className = 'arch-apps-slide-p';
      el.textContent = p;
      bodyEl.appendChild(el);
    });
    if (counterEl) {
      counterEl.textContent = String(idx + 1) + ' / ' + String(slides.length);
    }
    if (liveEl) {
      liveEl.textContent = 'Slide ' + String(idx + 1) + ' of ' + String(slides.length);
    }

    var prev = document.getElementById('archAppsPrev');
    var next = document.getElementById('archAppsNext');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= slides.length - 1;
  }

  function go(delta) {
    var n = idx + delta;
    if (n < 0 || n >= slides.length) return;
    idx = n;
    render();
  }

  function init() {
    titleEl = document.getElementById('archAppsSlideTitle');
    bodyEl = document.getElementById('archAppsSlideBody');
    counterEl = document.getElementById('archAppsCounter');
    liveEl = document.getElementById('archAppsLive');

    var prev = document.getElementById('archAppsPrev');
    var next = document.getElementById('archAppsNext');
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });

    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

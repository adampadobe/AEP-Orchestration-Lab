/**
 * @deprecated Use site-clone-bc.js. Kept so cached lab pages still load the embed BC stack.
 */
(function (doc) {
  window.SiteCloneBcPage = window.SiteCloneBcPage || {
    iframeId: 'siteCloneDemoSiteFrame',
    defaultFrameSrc: 'mod-demo-assets/army-home-snapshot.html',
    snapshotLayout: 'british-army-home',
  };
  var s = doc.createElement('script');
  s.src = 'site-clone-bc.js';
  s.async = false;
  (doc.head || doc.documentElement).appendChild(s);
})(document);

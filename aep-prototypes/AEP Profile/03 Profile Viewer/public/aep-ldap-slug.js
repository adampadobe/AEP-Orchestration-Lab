/**
 * LDAP / RTDB slug normalization (client) — matches functions/labRtdbSlug.js.
 */
(function (global) {
  'use strict';

  var RESERVED_SLUGS = {
    workspaceclaims: true,
    userworkspaceowners: true,
    userworkspaces: true,
    ajolookups: true,
    profileviewerconfig: true,
  };

  function normalizeLdapSlug(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return '';
    if (RESERVED_SLUGS[s]) return '';
    return s;
  }

  function ldapSlugFromEmail(email, firstName, lastName) {
    var localPart = String(email || '').split('@')[0] || '';
    var fromEmail = normalizeLdapSlug(localPart);
    if (fromEmail) return fromEmail;
    var fromName = normalizeLdapSlug(String(firstName || '') + '.' + String(lastName || ''));
    if (fromName) return fromName;
    return normalizeLdapSlug('workspace-user') || 'workspace-user';
  }

  /** Workspace display name slug (hyphenated) — legacy; prefer normalizeLdapSlug for RTDB paths. */
  function toDisplaySlug(raw) {
    return String(raw || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  global.AepLdapSlug = {
    RESERVED_SLUGS: RESERVED_SLUGS,
    normalizeLdapSlug: normalizeLdapSlug,
    ldapSlugFromEmail: ldapSlugFromEmail,
    toDisplaySlug: toDisplaySlug,
  };
})(typeof window !== 'undefined' ? window : this);

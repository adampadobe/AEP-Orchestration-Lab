/**
 * LDAP / RTDB workspace slug normalization (server).
 * Matches client `AepLdapSlug.normalize` and database.rules.json validation.
 */

const RESERVED_SLUGS = {
  workspaceclaims: true,
  userworkspaceowners: true,
  userworkspaces: true,
  ajolookups: true,
  profileviewerconfig: true,
};

function normalizeLdapSlug(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  if (s.length < 2 || s.length > 48) return '';
  if (RESERVED_SLUGS[s]) return '';
  return s;
}

function ldapSlugFromEmail(email, firstName, lastName) {
  const localPart = String(email || '').split('@')[0] || '';
  const fromEmail = normalizeLdapSlug(localPart);
  if (fromEmail) return fromEmail;
  const fromName = normalizeLdapSlug(`${firstName || ''}.${lastName || ''}`.replace(/\s+/g, '.'));
  if (fromName) return fromName;
  return normalizeLdapSlug('workspace-user') || 'workspace-user';
}

/** @deprecated use ldapSlugFromEmail — alias for existing call sites */
function buildWorkspaceSlug(email, firstName, lastName) {
  return ldapSlugFromEmail(email, firstName, lastName);
}

module.exports = {
  RESERVED_SLUGS,
  normalizeLdapSlug,
  ldapSlugFromEmail,
  buildWorkspaceSlug,
};

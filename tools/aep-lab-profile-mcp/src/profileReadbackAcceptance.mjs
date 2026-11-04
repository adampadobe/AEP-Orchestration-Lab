const CORE_PATH = 'identification.core.';

function fieldMatches(rows, field, expected) {
  const suffix = `${CORE_PATH}${field}`;
  return Array.isArray(rows) && rows.some((row) =>
    typeof row?.path === 'string'
      && row.path.toLowerCase().includes(suffix)
      && String(row.value ?? '').trim() === expected);
}

function isFound(result) {
  return result?.ok === true && result.data?.found === true;
}

function assertReadOnlyLookupResult(result, namespace) {
  if (result?.ok === true || result?.status === 404) return;
  throw new Error(
    `${namespace} profile lookup failed with HTTP ${Number(result?.status) || 0}; acceptance stopped.`,
  );
}

function assessFirstEmailReadback(data, email, ecid) {
  const hints = data?.profileAccessHints || {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    profileEmailMatches: data?.profileEmail === email,
    profileEcidMatches: String(data?.ecid ?? '').trim() === ecid,
    identityMapHasEmail: hints.identityMapHasEmail === true,
    identityMapHasEcid: hints.identityMapHasEcid === true,
    coreEmailMatches: fieldMatches(rows, 'email', email),
    coreEcidMatches: fieldMatches(rows, 'ecid', ecid),
  };
}

function allChecksPass(checks) {
  return Object.values(checks).every(Boolean);
}

/**
 * Read-only post-generation acceptance. The caller supplies the generation
 * completion time so the SLA includes any delay before this check is started.
 */
export async function runProfileReadbackAcceptance({
  sandbox,
  industry,
  email,
  ecid,
  generatedAt,
  slaSeconds = 60,
  pollIntervalMs = 5_000,
  lookupProfile,
  onLookup,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (typeof lookupProfile !== 'function') throw new TypeError('lookupProfile is required.');
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) throw new TypeError('generatedAt must be a valid ISO-8601 timestamp.');
  if (!Number.isFinite(slaSeconds) || slaSeconds <= 0) throw new TypeError('slaSeconds must be positive.');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new TypeError('pollIntervalMs must be positive.');

  const deadlineMs = generatedAtMs + slaSeconds * 1_000;
  let emailReadAttempts = 0;
  let ecidReadAttempts = 0;
  let firstReadbackChecks = null;

  while (true) {
    const emailAttempt = firstReadbackChecks ? null : emailReadAttempts + 1;
    const ecidAttempt = ecidReadAttempts + 1;
    const [emailResult, ecidResult] = await Promise.all([
      firstReadbackChecks
        ? Promise.resolve(null)
        : lookupProfile({ sandbox, namespace: 'email', identifier: email }),
      lookupProfile({ sandbox, namespace: 'ecid', identifier: ecid }),
    ]);

    if (!firstReadbackChecks) {
      emailReadAttempts += 1;
      onLookup?.({
        namespace: 'email',
        attempt: emailAttempt,
        status: Number(emailResult?.status) || 0,
        found: isFound(emailResult),
        elapsedMs: Math.max(0, now() - generatedAtMs),
      });
      assertReadOnlyLookupResult(emailResult, 'Email');
      if (isFound(emailResult)) {
        firstReadbackChecks = assessFirstEmailReadback(emailResult.data, email, ecid);
        if (!allChecksPass(firstReadbackChecks)) {
          return {
            ok: false,
            reason: 'first_email_readback_missing_required_identity',
            elapsedSeconds: Math.max(0, (now() - generatedAtMs) / 1_000),
            emailReadAttempts,
            ecidReadAttempts,
            firstReadbackChecks,
          };
        }
      }
    }

    ecidReadAttempts += 1;
    onLookup?.({
      namespace: 'ecid',
      attempt: ecidAttempt,
      status: Number(ecidResult?.status) || 0,
      found: isFound(ecidResult),
      elapsedMs: Math.max(0, now() - generatedAtMs),
    });
    assertReadOnlyLookupResult(ecidResult, 'ECID');
    const elapsedMs = now() - generatedAtMs;
    if (
      firstReadbackChecks
      && isFound(ecidResult)
      && ecidResult.data?.profileEmail === email
      && String(ecidResult.data?.ecid ?? '').trim() === ecid
      && ecidResult.data?.profileAccessHints?.identityMapHasEmail === true
      && ecidResult.data?.profileAccessHints?.identityMapHasEcid === true
      && elapsedMs <= slaSeconds * 1_000
    ) {
      return {
        ok: true,
        elapsedSeconds: Math.max(0, elapsedMs / 1_000),
        emailReadAttempts,
        ecidReadAttempts,
        firstReadbackChecks,
      };
    }

    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  return {
    ok: false,
    reason: firstReadbackChecks ? 'ecid_lookup_sla_exceeded' : 'email_profile_not_found_within_sla',
    elapsedSeconds: Math.max(0, (now() - generatedAtMs) / 1_000),
    emailReadAttempts,
    ecidReadAttempts,
    firstReadbackChecks,
  };
}

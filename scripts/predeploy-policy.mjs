export function evaluateDeployPolicy({
  previewDeploy = false,
  override = false,
  fetchedOrigin = false,
  branch = '',
  ahead = 0,
  behind = 0,
  dirty = false,
} = {}) {
  if (previewDeploy) return { allowed: true, mode: 'preview', reasons: [] };
  if (override) return { allowed: true, mode: 'emergency-override', reasons: [] };

  const reasons = [];
  if (!fetchedOrigin) reasons.push('origin/main could not be refreshed');
  if (branch !== 'main') reasons.push(`current branch is ${branch || '(detached HEAD)'}, not main`);
  if (ahead !== 0 || behind !== 0) reasons.push(`HEAD does not exactly match origin/main (+${ahead} / -${behind})`);
  if (dirty) reasons.push('tracked files contain uncommitted changes');

  return { allowed: reasons.length === 0, mode: 'production', reasons };
}

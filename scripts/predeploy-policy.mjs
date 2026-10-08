export function evaluateDeployPolicy({
  previewDeploy = false,
  override = false,
  fetchedOrigin = false,
  branch = '',
  ahead = 0,
  behind = 0,
  dirty = false,
  untrackedDeployFiles = false,
} = {}) {
  if (previewDeploy) return { allowed: true, mode: 'preview', reasons: [] };
  if (override) return { allowed: true, mode: 'emergency-override', reasons: [] };

  const reasons = [];
  if (!fetchedOrigin) reasons.push('origin/main could not be refreshed');
  if (branch !== 'main') reasons.push(`current branch is ${branch || '(detached HEAD)'}, not main`);
  if (ahead !== 0 || behind !== 0) reasons.push(`HEAD does not exactly match origin/main (+${ahead} / -${behind})`);
  if (dirty) reasons.push('tracked files contain uncommitted changes');
  if (untrackedDeployFiles) reasons.push('untracked files exist under Firebase deploy roots');

  return { allowed: reasons.length === 0, mode: 'production', reasons };
}

// Build stamps rewritten by scripts/build-version.mjs on every predeploy run.
// A combined `deploy --only functions,hosting` runs the predeploy hook twice,
// so the second run must not treat the first run's stamp as a dirty source.
export const BUILD_STAMP_PATHS = Object.freeze(['web/version.json', 'functions/version.json']);

export function hasDirtyTrackedFiles(porcelain = '') {
  return String(porcelain)
    .split('\n')
    .map((line) => line.trim().replace(/^\S+\s+/, ''))
    .filter(Boolean)
    .some((path) => !BUILD_STAMP_PATHS.includes(path));
}

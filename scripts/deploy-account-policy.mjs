const EXPECTED_GITHUB_REPOSITORY = 'adampadobe/AEP-Orchestration-Lab';
const EXPECTED_FIREBASE_PROJECT = 'aep-orchestration-lab';

function normalizeGitHubRepository(remoteUrl = '') {
  const value = remoteUrl.trim().replace(/\.git$/, '');
  const match = value.match(
    /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+)$/i,
  );
  return match ? match[1] : '';
}

function firebaseProjectIds(payload) {
  if (!payload || payload.status !== 'success') return [];
  const projects = Array.isArray(payload.result)
    ? payload.result
    : Array.isArray(payload.result?.projects)
      ? payload.result.projects
      : [];
  return projects
    .map((project) => project?.projectId || project?.project_id || '')
    .filter(Boolean);
}

function evaluateDeployAccountPolicy({
  remoteUrl = '',
  githubRepository = '',
  githubAccessVerified = false,
  firebaseTarget = '',
  accessibleFirebaseProjects = [],
} = {}) {
  const reasons = [];
  const remoteRepository = normalizeGitHubRepository(remoteUrl);

  if (remoteRepository !== EXPECTED_GITHUB_REPOSITORY) {
    reasons.push(
      `origin resolves to ${remoteRepository || '(unrecognized remote)'}, not ${EXPECTED_GITHUB_REPOSITORY}`,
    );
  }
  if (githubRepository !== EXPECTED_GITHUB_REPOSITORY) {
    reasons.push(
      `GitHub access resolved ${githubRepository || '(no repository)'}, not ${EXPECTED_GITHUB_REPOSITORY}`,
    );
  }
  if (!githubAccessVerified) {
    reasons.push(`authenticated GitHub access to ${EXPECTED_GITHUB_REPOSITORY} was not verified`);
  }
  if (firebaseTarget !== EXPECTED_FIREBASE_PROJECT) {
    reasons.push(
      `Firebase target is ${firebaseTarget || '(not explicit)'}, not ${EXPECTED_FIREBASE_PROJECT}`,
    );
  }
  if (!accessibleFirebaseProjects.includes(EXPECTED_FIREBASE_PROJECT)) {
    reasons.push(`authenticated Firebase access to ${EXPECTED_FIREBASE_PROJECT} was not verified`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    remoteRepository,
  };
}

export {
  EXPECTED_FIREBASE_PROJECT,
  EXPECTED_GITHUB_REPOSITORY,
  evaluateDeployAccountPolicy,
  firebaseProjectIds,
  normalizeGitHubRepository,
};

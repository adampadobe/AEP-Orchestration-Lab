import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export function getBuildInfo(env = process.env) {
  const sha = String(env.AEP_LAB_BUILD_SHA || '');
  const pr = String(env.AEP_LAB_BUILD_PR || '');
  return {
    version,
    commitSha: /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : null,
    revision: env.K_REVISION || null,
    pullRequest: /^[1-9]\d*$/.test(pr) ? Number(pr) : null,
  };
}

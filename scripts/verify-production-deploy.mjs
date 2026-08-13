#!/usr/bin/env node

const expectedSha = (process.env.EXPECTED_GIT_SHA || process.argv[2] || '').trim();
const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://aep-orchestration-lab.web.app').replace(/\/$/, '');

if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
  console.error('EXPECTED_GIT_SHA must be a full 40-character Git SHA.');
  process.exit(2);
}

async function read(path) {
  const response = await fetch(`${baseUrl}${path}${path.includes('?') ? '&' : '?'}cb=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.text();
}

try {
  const version = JSON.parse(await read('/version.json'));
  if (version.gitSha !== expectedSha) {
    throw new Error(`live SHA ${version.gitSha || '(missing)'} does not match deployed SHA ${expectedSha}`);
  }

  const pdfPage = await read('/profile-viewer/pdf-personalisation.html');
  const requiredMarkers = [
    'Manage server templates',
    'Test transactional delivery',
    'Describe the journey',
    'AJO custom-action setup',
  ];
  const missing = requiredMarkers.filter((marker) => !pdfPage.includes(marker));
  if (missing.length) throw new Error(`PDF page is missing: ${missing.join(', ')}`);

  console.log(`Production smoke test passed for ${expectedSha.slice(0, 8)}.`);
} catch (error) {
  console.error(`Production smoke test failed: ${error.message}`);
  process.exit(1);
}

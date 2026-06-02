'use strict';

const test = require('node:test');
const assert = require('node:assert');
const archiver = require('archiver');
const { Writable } = require('stream');
const {
  extractSkillFromZip,
  pickPrimarySkillCandidate,
  MAX_ZIP_ENTRIES,
} = require('../claudeSkillsService');

async function buildZipBufferFromEntries(entries) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
  });
  const sinkDone = new Promise((resolve, reject) => {
    sink.once('finish', resolve);
    sink.once('error', reject);
    archive.once('error', reject);
  });
  archive.pipe(sink);
  for (const e of entries) {
    archive.append(e.buffer, { name: e.name });
  }
  await archive.finalize();
  await sinkDone;
  return Buffer.concat(chunks);
}

test('pickPrimarySkillCandidate prefers root SKILL.md', () => {
  const files = [
    { rawPath: 'readme.md', ext: 'md', bytes: Buffer.from('a') },
    { rawPath: 'SKILL.md', ext: 'md', bytes: Buffer.from('skill') },
  ];
  const picked = pickPrimarySkillCandidate(files);
  assert.strictEqual(picked.rawPath, 'SKILL.md');
});

test('pickPrimarySkillCandidate prefers single-folder SKILL.md', () => {
  const files = [
    { rawPath: 'my-skill/other.md', ext: 'md', bytes: Buffer.from('a') },
    { rawPath: 'my-skill/SKILL.md', ext: 'md', bytes: Buffer.from('skill') },
  ];
  const picked = pickPrimarySkillCandidate(files);
  assert.strictEqual(picked.rawPath, 'my-skill/SKILL.md');
});

test('extractSkillFromZip extracts accepted files and picks primary', async () => {
  const buf = await buildZipBufferFromEntries([
    { name: 'assets/notes.txt', buffer: Buffer.from('notes', 'utf8') },
    { name: 'demo-skill/SKILL.md', buffer: Buffer.from('# Demo skill\n', 'utf8') },
    { name: '__MACOSX/demo-skill/._SKILL.md', buffer: Buffer.from('junk', 'utf8') },
  ]);
  const { primary, files } = await extractSkillFromZip(buf);
  assert.strictEqual(primary.rawPath, 'demo-skill/SKILL.md');
  assert.strictEqual(files.length, 2);
  assert.ok(files.some((f) => f.rawPath === 'assets/notes.txt'));
});

test('extractSkillFromZip skips unsafe zip paths', async () => {
  const buf = await buildZipBufferFromEntries([
    { name: 'nested/../../evil.md', buffer: Buffer.from('nope', 'utf8') },
    { name: 'safe.md', buffer: Buffer.from('ok', 'utf8') },
  ]);
  const { primary, files } = await extractSkillFromZip(buf);
  assert.ok(!files.some((f) => f.rawPath.includes('..')));
  assert.ok(files.some((f) => f.rawPath === 'safe.md'));
  assert.strictEqual(primary.rawPath, 'safe.md');
});

test('extractSkillFromZip rejects empty skill archive', async () => {
  const buf = await buildZipBufferFromEntries([
    { name: 'image.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ]);
  await assert.rejects(
    () => extractSkillFromZip(buf),
    (err) => err.status === 400 && /no skill files/i.test(err.message),
  );
});

test('extractSkillFromZip rejects too many entries', async () => {
  const entries = [];
  for (let i = 0; i < MAX_ZIP_ENTRIES + 1; i += 1) {
    entries.push({ name: `f${i}.md`, buffer: Buffer.from('x', 'utf8') });
  }
  const buf = await buildZipBufferFromEntries(entries);
  await assert.rejects(
    () => extractSkillFromZip(buf),
    (err) => err.status === 400 && /too many/i.test(err.message),
  );
});

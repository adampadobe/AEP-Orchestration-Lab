import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNodeId, parseFigmaUrl, resolveFigmaTarget } from '../src/figmaApiClient.mjs';
import { commentPreflight, registerFigmaTools, simplifyNodeTree } from '../src/tools/figmaTools.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

test('parseFigmaUrl handles design, branch, and bare-key inputs', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/AbCdEf1234567890/Demo?node-id=12-34&t=x'), {
    ok: true, fileKey: 'AbCdEf1234567890', nodeId: '12:34', kind: 'design',
  });
  assert.equal(parseFigmaUrl('https://www.figma.com/design/AbCdEf1234567890/branch/BrAnCh123456/Demo').fileKey, 'BrAnCh123456');
  assert.equal(parseFigmaUrl('AbCdEf1234567890').fileKey, 'AbCdEf1234567890');
  assert.equal(parseFigmaUrl('https://evil.example.com/design/AbCdEf1234567890').ok, false);
  assert.equal(parseFigmaUrl('https://figma.com.evil.io/design/AbCdEf1234567890').ok, false);
  assert.equal(parseFigmaUrl('').ok, false);
  assert.equal(normalizeNodeId('1-2'), '1:2');
  assert.equal(resolveFigmaTarget({ url: 'https://www.figma.com/file/AbCdEf1234567890/x?node-id=1-2', node_id: '5-6' }).nodeId, '5:6');
});

test('simplifyNodeTree compacts design data and respects limits', () => {
  const root = {
    id: '0:1', name: 'Frame', type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 100.456, height: 50 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    children: [
      { id: '0:2', name: 'Title', type: 'TEXT', characters: 'Hello', style: { fontFamily: 'Inter', fontSize: 16 } },
      { id: '0:3', name: 'Group', type: 'GROUP', children: [{ id: '0:4', name: 'Deep', type: 'RECTANGLE' }] },
    ],
  };
  const design = simplifyNodeTree(root);
  assert.equal(design.nodeCount, 4);
  assert.equal(design.truncated, false);
  assert.match(JSON.stringify(design.tree), /#FF0000/i);
  assert.match(JSON.stringify(design.tree), /Hello/);

  const shallow = simplifyNodeTree(root, { mode: 'metadata', maxDepth: 1 });
  assert.equal(shallow.truncated, true);
  assert.equal(shallow.tree.children[1].childCount, 1);
  assert.equal(shallow.tree.fills, undefined);

  const capped = simplifyNodeTree(root, { maxNodes: 2 });
  assert.equal(capped.nodeCount, 2);
  assert.equal(capped.truncated, true);
});

test('commentPreflight is deterministic and content-bound', () => {
  const a = commentPreflight({ fileKey: 'AbCdEf1234567890', message: ' Looks good ', nodeId: '1:2' });
  const b = commentPreflight({ fileKey: 'AbCdEf1234567890', message: 'Looks good', nodeId: '1:2' });
  const c = commentPreflight({ fileKey: 'AbCdEf1234567890', message: 'Looks bad', nodeId: '1:2' });
  assert.equal(a.preflight_id, b.preflight_id);
  assert.notEqual(a.preflight_id, c.preflight_id);
  assert.match(a.confirmation, /^POST FIGMA COMMENT [0-9A-F]{12}$/);
});

test('figma tools fail clearly without a token and annotate writes', async () => {
  const handlers = new Map();
  registerFigmaTools({ registerTool(name, _cfg, handler) { handlers.set(name, handler); } });
  const saved = process.env.FIGMA_ACCESS_TOKEN;
  delete process.env.FIGMA_ACCESS_TOKEN;
  try {
    const result = await handlers.get('figma_whoami')({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /FIGMA_ACCESS_TOKEN/);
  } finally {
    if (saved !== undefined) process.env.FIGMA_ACCESS_TOKEN = saved;
  }
  assert.equal(annotationsForTool('figma_get_file').readOnlyHint, true);
  assert.equal(annotationsForTool('figma_post_comment').readOnlyHint, false);
});

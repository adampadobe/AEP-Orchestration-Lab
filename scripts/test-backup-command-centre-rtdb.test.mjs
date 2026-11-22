import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCommandCentres } from './backup-command-centre-rtdb.mjs';

test('backup reads only each Command Centre subtree and preserves all buckets without writes', async () => {
  const calls = [];
  const state = { default: { customers: [{ id: 'customer-1' }] }, secondary: { tasks: [] } };
  const backup = await collectCommandCentres({
    listWorkspaces: async () => ['first', 'empty', 'last'],
    readCommandCentre: async (path) => {
      calls.push(path);
      return path.includes('/empty/') ? null : state;
    },
  });
  assert.deepEqual(calls, [
    'userWorkspaces/first/commandCentre',
    'userWorkspaces/empty/commandCentre',
    'userWorkspaces/last/commandCentre',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(backup)), {
    userWorkspaces: { first: { commandCentre: state }, last: { commandCentre: state } },
  });
});

test('backup propagates enumeration and per-workspace failures instead of returning partial success', async () => {
  await assert.rejects(collectCommandCentres({
    listWorkspaces: async () => { throw new Error('enumeration denied'); },
  }), /enumeration denied/);
  await assert.rejects(collectCommandCentres({
    listWorkspaces: async () => ['first', 'denied'],
    readCommandCentre: async (path) => {
      if (path.includes('/denied/')) throw new Error('read denied');
      return {};
    },
  }), /read denied/);
});

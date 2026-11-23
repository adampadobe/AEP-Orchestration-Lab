import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContext } from '../src/requestContext.mjs';
import { assertOwnerReadSandbox } from '../src/ownerReadAccess.mjs';

const access = { allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) };
const owner = async () => ({ uid: 'owner', disabled: false });

test('only an enabled owner user key gets a cross-sandbox read exception', async () => {
  for (const [context, getOwner, allowed] of [
    [{ authSource: 'user', principalUid: 'owner' }, owner, true],
    [{ authSource: 'user', principalUid: 'other' }, owner, false],
    [{ authSource: 'ims', principalUid: 'owner' }, owner, false],
    [{ authSource: 'user', principalUid: 'owner' }, async () => ({ uid: 'owner', disabled: true }), false],
  ]) {
    await requestContext.run({ ...context, principalAccess: access }, async () => {
      assert.equal((await assertOwnerReadSandbox('kirkham', { getOwner })).ok, allowed);
      assert.equal((await assertOwnerReadSandbox('../bad', { getOwner })).ok, false);
      assert.equal((await assertOwnerReadSandbox('apalmer', { getOwner })).ok, true);
    });
  }
});

test('owner authorization errors fail closed', async () => {
  await requestContext.run({ authSource: 'user', principalUid: 'owner', principalAccess: access }, async () => {
    await assert.rejects(assertOwnerReadSandbox('kirkham', {
      getOwner: async () => { throw new Error('unavailable'); },
    }), /Owner read authorization is unavailable/);
  });
});

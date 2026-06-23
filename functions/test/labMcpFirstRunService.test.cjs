'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLabMcpFirstRunService } = require('../labMcpFirstRunService');

describe('labMcpFirstRunService', () => {
  it('writes workspace profile and provisions RTDB when fields provided', async () => {
    let upserted = null;
    let provisioned = null;

    const service = createLabMcpFirstRunService({
      labUserSandboxStore: {
        getWorkspaceProfile: async () => null,
        upsertWorkspaceProfile: async (_uid, profile) => {
          upserted = profile;
          return { ...profile, uid: 'uid-1' };
        },
      },
      labRtdbProvisionService: {
        userOwnsWorkspace: async () => false,
        provisionUserRtdbWorkspace: async (input) => {
          provisioned = input;
          return { ok: true, ldapSlug: input.workspaceSlug, uid: input.uid };
        },
      },
      labProfileGenerationPrefsStore: {
        getPrefs: async () => ({ baseEmail: '', nextScaledEmail: 'demo+01012026-1@adobetest.com' }),
      },
    });

    const result = await service.runFirstRunSetup({
      uid: 'uid-1',
      principalEmail: 'prisacar@adobe.com',
      sandbox: 'prisacar',
      body: {
        workspace_slug: 'prisacar',
        first_name: 'Priya',
        last_name: 'Sacar',
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.workspaceSlug, 'prisacar');
    assert.equal(result.foundationsReady, true);
    assert.equal(upserted.workspaceSlug, 'prisacar');
    assert.equal(provisioned.workspaceSlug, 'prisacar');
    assert.equal(result.checklist.workspace_profile.ready, true);
    assert.equal(result.checklist.rtdb_workspace.ready, true);
  });
});

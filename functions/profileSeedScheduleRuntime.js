'use strict';

const { OWNER_EMAIL } = require('./labUsageService');
const { createProfileSeedScheduleService } = require('./profileSeedScheduleService');
const { createProfileSeedScheduleStore } = require('./profileSeedScheduleStore');
const { createMyDataFlowsSnowflake } = require('./myDataFlowsSnowflake');
const { createMyDataFlowsService } = require('./myDataFlowsService');
const { relevantBindings } = require('./myDataFlowsTraceService');

function createProfileSeedScheduleRuntime({ db, auth, getAdobeAuth, logger = console }) {
  return createProfileSeedScheduleService({
    store: createProfileSeedScheduleStore(db),
    snowflake: createMyDataFlowsSnowflake(),
    getOwner: () => auth.getUserByEmail(OWNER_EMAIL),
    flowSnapshot: async (industry) => createMyDataFlowsService({
      registry: relevantBindings(industry),
      getConnection: async () => null, getEventConfig: async () => null,
    }).snapshot(await getAdobeAuth()),
    logger,
  });
}

module.exports = { createProfileSeedScheduleRuntime };

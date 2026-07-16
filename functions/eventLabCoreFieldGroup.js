/**
 * Lean ExperienceEvent field group for AEP Orchestration Lab Event Tool.
 * Replaces Adobe Experience Event Core v2.1 (avoids commerce.* required-field overhead).
 *
 * Base ExperienceEvent class still supplies: _id, eventType, timestamp, identityMap.
 * This mixin adds only web page context + optional orchestration eventID.
 */

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

const EVENT_LAB_CORE_V1_FG_TITLE = 'AEP Lab - Event Core v1';

function xdmStringField(title, description) {
  const f = { type: 'string', title, 'meta:xdmType': 'string' };
  if (description) f.description = description;
  return f;
}

/** Root ExperienceEvent leaves used by Event Tool Edge payloads (no commerce metrics). */
const EVENT_LAB_CORE_V1_ROOT_PROPERTIES = {
  web: {
    type: 'object',
    title: 'Web',
    description: 'Web page context for lab industry and quick-trigger events.',
    properties: {
      webPageDetails: {
        type: 'object',
        title: 'Web page details',
        properties: {
          name: xdmStringField('Page name', 'Human-readable page title.'),
          URL: xdmStringField('Page URL', 'Full page URL.'),
          viewName: xdmStringField('View name', 'Logical view name (AJO / UPS).'),
        },
        'meta:xdmType': 'object',
      },
    },
    'meta:xdmType': 'object',
  },
  _experience: {
    type: 'object',
    title: 'Experience Cloud',
    description: 'Optional journey / campaign orchestration reference.',
    properties: {
      campaign: {
        type: 'object',
        title: 'Campaign',
        properties: {
          orchestration: {
            type: 'object',
            title: 'Orchestration',
            properties: {
              eventID: xdmStringField('Orchestration event ID'),
            },
            'meta:xdmType': 'object',
          },
        },
        'meta:xdmType': 'object',
      },
    },
    'meta:xdmType': 'object',
  },
};

function buildEventLabCoreV1ExperienceEventFieldGroup() {
  return {
    title: EVENT_LAB_CORE_V1_FG_TITLE,
    description:
      'AEP Orchestration Lab — minimal ExperienceEvent mixin (web.webPageDetails + orchestration eventID). ' +
      'Use with base ExperienceEvent class; does not add commerce required metrics.',
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    definitions: {
      eventLabCoreV1Block: {
        type: 'object',
        properties: EVENT_LAB_CORE_V1_ROOT_PROPERTIES,
        'meta:xdmType': 'object',
      },
    },
    allOf: [{ $ref: '#/definitions/eventLabCoreV1Block' }],
  };
}

module.exports = {
  EVENT_LAB_CORE_V1_FG_TITLE,
  EVENT_LAB_CORE_V1_ROOT_PROPERTIES,
  buildEventLabCoreV1ExperienceEventFieldGroup,
};

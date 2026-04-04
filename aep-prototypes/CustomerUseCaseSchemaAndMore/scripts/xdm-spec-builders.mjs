/**
 * Shared XDM spec → field group / schema payloads (operational naming).
 */

const CLASS_URIS = {
  experienceevent: 'https://ns.adobe.com/xdm/context/experienceevent',
  profile: 'https://ns.adobe.com/xdm/context/profile',
};

const OPERATIONAL_PREFIX = 'Operational - ';

export function operationalTitle(fragment) {
  const t = String(fragment || '').trim();
  if (!t) throw new Error('operationalUseCaseName (or schema title) is required');
  const normalized = t.replace(/^(operational\s*-\s*)/i, '').trim();
  return `${OPERATIONAL_PREFIX}${normalized}`;
}

export function resolveSpecTitles(spec) {
  let schemaTitle = spec.schemaTitle;
  if (spec.operationalUseCaseName) {
    schemaTitle = operationalTitle(spec.operationalUseCaseName);
  }
  if (!schemaTitle) throw new Error('Set operationalUseCaseName or schemaTitle');
  if (!schemaTitle.startsWith(OPERATIONAL_PREFIX)) {
    schemaTitle = operationalTitle(schemaTitle);
  }

  const fieldGroupTitle =
    spec.fieldGroupTitle || `${schemaTitle} — field group`;

  const datasetName = spec.datasetName || schemaTitle;
  if (spec.datasetName && !datasetName.startsWith(OPERATIONAL_PREFIX)) {
    throw new Error(`datasetName must start with "${OPERATIONAL_PREFIX.trim()}"`);
  }

  const audienceName =
    spec.audienceName || `${schemaTitle} — core supporters`;

  if (spec.audienceName && !audienceName.startsWith(OPERATIONAL_PREFIX)) {
    throw new Error(`audienceName must start with "${OPERATIONAL_PREFIX.trim()}"`);
  }

  return { schemaTitle, fieldGroupTitle, datasetName, audienceName };
}

export { CLASS_URIS };

export function stripInternalKeys(spec) {
  const { _comment, ...rest } = spec;
  return rest;
}

export function buildProperty(f) {
  if (!f || typeof f !== 'object') throw new Error('Invalid field definition');
  const t = f.type;
  if (t === 'object') {
    const props = f.properties;
    if (!props || typeof props !== 'object') throw new Error(`object field missing properties`);
    return {
      type: 'object',
      properties: buildProperties(props),
      ...(f.description ? { description: f.description } : {}),
    };
  }
  if (t === 'array') {
    if (!f.items) throw new Error(`array field missing items`);
    return {
      type: 'array',
      items: buildProperty(f.items),
      ...(f.description ? { description: f.description } : {}),
    };
  }
  const base = { type: t };
  if (f.format) base.format = f.format;
  if (f.description) base.description = f.description;
  if (Array.isArray(f.enum)) {
    base.enum = f.enum;
    if (f['meta:enum'] && typeof f['meta:enum'] === 'object') base['meta:enum'] = f['meta:enum'];
  }
  return base;
}

export function buildProperties(fieldsObj) {
  const out = {};
  for (const [key, val] of Object.entries(fieldsObj)) {
    out[key] = buildProperty(val);
  }
  return out;
}

export function tenantKey(tenantId) {
  const id = String(tenantId || '').replace(/^_/, '');
  if (!id) throw new Error('ADOBE_TENANT_ID is required in environment (e.g. demoemea, no underscore).');
  return `_${id}`;
}

export function buildFieldGroupPayload(spec, tenantProp, titles) {
  const tKey = tenantKey(tenantProp);
  const defName = spec.definitionName || 'customFields';
  const objectKey = spec.tenantObjectKey || spec.objectKey || 'useCaseData';
  const xdmClass = (spec.xdmClass || 'experienceevent').toLowerCase();
  const intended = CLASS_URIS[xdmClass];
  if (!intended) {
    throw new Error(`xdmClass must be "experienceevent" or "profile", got: ${spec.xdmClass}`);
  }

  const fieldsRoot = spec.fields && typeof spec.fields === 'object' ? spec.fields : {};
  const tenantInner = buildProperties(fieldsRoot);

  return {
    type: 'object',
    title: titles.fieldGroupTitle,
    description: spec.fieldGroupDescription || spec.schemaDescription || '',
    'meta:intendedToExtend': [intended],
    definitions: {
      [defName]: {
        type: 'object',
        properties: {
          [tKey]: {
            type: 'object',
            properties: {
              [objectKey]: {
                type: 'object',
                properties: tenantInner,
                ...(spec.tenantObjectDescription ? { description: spec.tenantObjectDescription } : {}),
              },
            },
          },
        },
      },
    },
    allOf: [{ $ref: `#/definitions/${defName}` }],
  };
}

export function buildSchemaPayload(spec, fieldGroupId, titles) {
  const xdmClass = (spec.xdmClass || 'experienceevent').toLowerCase();
  const classUri = CLASS_URIS[xdmClass];
  if (!classUri) throw new Error(`Invalid xdmClass: ${spec.xdmClass}`);

  const allOf = [{ $ref: classUri }, { $ref: fieldGroupId }];

  return {
    title: titles.schemaTitle,
    description: spec.schemaDescription || '',
    type: 'object',
    allOf,
  };
}

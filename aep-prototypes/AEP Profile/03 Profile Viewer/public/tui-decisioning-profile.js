(function (root) {
  'use strict';
  const model = typeof module !== 'undefined' && module.exports
    ? require('./tui-decisioning-model.js') : root.TuiDecisioning;
  const relative = path => String(path).replace(/^_[A-Za-z0-9]+\./, '');
  const industry = field => /^(consents\.|_[^.]+\.(scoring|loyaltyDetails)\.)/.test(field.path) ? 'generic' : 'travel';
  function schemaLeaf(schema, config, path) {
    const walk = node => path.split('.').reduce((at, part) => at?.properties?.[part], node);
    const key = value => {
      if (value === undefined || value === null || value === '') return '';
      if (typeof value !== 'string' || !/^_?[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error('Invalid schema tenant metadata.');
      return '_' + value.replace(/^_/, '');
    };
    const configured = key(config.xdmKey), declared = key(schema['meta:tenantNamespace']);
    if (configured && declared && configured !== declared) throw new Error('Write schema tenant does not match the configured dataflow.');
    if (path.startsWith('consents.')) return walk(schema);
    const explicit = configured || declared;
    if (explicit) {
      if (schema.properties?.[explicit]?.type !== 'object' && !schema.properties?.[explicit]?.properties) {
        throw new Error('Configured schema tenant is missing: ' + explicit);
      }
      return walk(schema.properties[explicit]);
    }
    const candidates = Object.entries(schema.properties || {}).filter(([name, node]) =>
      /^_[A-Za-z0-9]+$/.test(name) && !['_id', '_repo', '_experience', '_links'].includes(name) && node?.properties);
    if (candidates.length !== 1) throw new Error('Cannot resolve one schema tenant for ' + path + '. Check the dataflow XDM key.');
    return walk(candidates[0][1]);
  }
  function scalar(row) {
    if (row.valueType === 'number') {
      if (row.value === '' || row.value === null || !Number.isFinite(Number(row.value))) throw new Error('Invalid number: ' + row.path);
      return Number(row.value);
    }
    if (row.valueType === 'boolean') {
      if (![true, false, 'true', 'false'].includes(row.value)) throw new Error('Invalid boolean: ' + row.path);
      return row.value === true || row.value === 'true';
    }
    return row.valueType === 'null' ? null : row.value;
  }
  function signals(rows, defaults) {
    const result = defaults ? { ...model.defaults } : {};
    for (const field of model.fields) {
      const row = rows.find(row => relative(row.path) === relative(field.path));
      if (row && scalar(row) !== null) {
        if (typeof scalar(row) !== field.type) throw new Error('Profile type mismatch: ' + row.path);
        result[field.key] = scalar(row);
      }
    }
    return result;
  }
  function snapshots(data, state, edited) {
    const groups = new Map(), expected = {};
    for (const key of edited) {
      const field = model.fields.find(f => f.key === key);
      if (!field || typeof state[key] !== field.type || field.type === 'number' && !Number.isFinite(state[key])) {
        throw new Error('Invalid staged signal: ' + key);
      }
      const owner = industry(field), config = data.industries?.[owner];
      if (!config?.writable || !config.schemaId) throw new Error('Configure the existing ' + owner + ' profile dataflow first.');
      const incompatible = model.fields.filter(f => industry(f) === owner).some(f =>
        data.rows.some(row => relative(row.path) === relative(f.path) && (row.industry !== owner || row.writable !== true)));
      if (incompatible) throw new Error('Profile API ownership is not ready for ' + owner + '. Do not stream a partial snapshot.');
      if (!groups.has(owner)) {
        const rows = data.rows.filter(row => row.industry === owner && row.writable === true);
        if (!rows.length) throw new Error('No writable snapshot for ' + owner + '. Load a profile from its configured dataflow first.');
        groups.set(owner, new Map(rows.map(row => [relative(row.path), {
          path: relative(row.path), value: scalar(row), valueType: row.valueType,
        }])));
      }
      const path = relative(field.path);
      expected[path] = state[key];
      groups.get(owner).set(path, { path, value: state[key], valueType: field.type });
    }
    return { expected, snapshots: [...groups].map(([owner, rows]) => ({ industry: owner, updates: [...rows.values()] })) };
  }
  function differences(rows, expected) {
    const actual = new Map(rows.map(row => [relative(row.path), scalar(row)]));
    const insensitive = new Set(model.objectives.flatMap(objective => [objective.rule, ...objective.offers.map(offer => offer.rule)]
      .filter(Boolean).flatMap(rule => rule.conditions.filter(condition => ['eq', 'in'].includes(condition.op))
        .map(condition => relative(condition.path)))));
    return Object.keys(expected).filter(path => {
      const value = actual.get(path), wanted = expected[path];
      return insensitive.has(path) && typeof value === 'string' && typeof wanted === 'string'
        ? value.toLowerCase() !== wanted.toLowerCase() : value !== wanted;
    });
  }
  const api = { relative, industry, schemaLeaf, scalar, signals, snapshots, differences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TuiDecisioningProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

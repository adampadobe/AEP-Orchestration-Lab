/**
 * Vuse customer writes: read a complete Generic snapshot, overlay explicit form fields,
 * then send once. A DCS receipt is not a UPS readback or an identity-graph guarantee.
 *
 * Browser: VuseItaliaProfile.submit({sandbox,email,ecid,details,preferences,isNew}).
 * isNew: true requires confirmed absence; false requires an existing profile;
 * omit for guest checkout to choose only after the strict snapshot read.
 * Tests/injection: VuseItaliaProfile.create({labAuthFetch}).submit(...).
 * Details: firstName,lastName,dateOfBirth,phone,address:{street1,city,postalCode,countryCode}.
 * Preferences: {vuse,velo,glo}:{email,sms,whatsapp} booleans. Only explicit schema
 * properties under preferences[.brands].<brand>.<channel> are supported; unsupported
 * brand/channel storage is rejected, never flattened into global marketing consent.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VuseItaliaProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var brands = ['vuse', 'velo', 'glo'];
  var channels = ['email', 'sms', 'whatsapp'];
  var forbidden = /(^|\.)(__proto__|prototype|constructor|[^.]*(?:password|passwd|secret|token|authorization|payment|cardNumber|creditCard|cvv|cvc|iban)[^.]*)(\.|$)/i;
  var detailPaths = {
    firstName: 'person.name.firstName',
    lastName: 'person.name.lastName',
    dateOfBirth: 'person.birthDate',
    phone: 'mobilePhone.number'
  };
  var addressPaths = { street1: 'homeAddress.street1', city: 'homeAddress.city', postalCode: 'homeAddress.postalCode', countryCode: 'homeAddress.countryCode' };

  function failure(code, message, uncertain) {
    var error = new Error(message);
    error.code = code;
    error.uncertain = uncertain === true;
    return error;
  }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_FORM', label + ' must be an object.');
    return value;
  }
  function keys(value, allowed, label) {
    object(value, label);
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) < 0) throw failure('INVALID_FORM', 'Unsupported ' + label + ' field: ' + key);
    });
  }
  function text(value, label) {
    if (typeof value !== 'string' || value.length > 500) throw failure('INVALID_FORM', label + ' must be a short string.');
    return value.trim();
  }
  function scalar(row) {
    var value = row.value;
    switch (row.valueType) {
      case 'null': return null;
      case 'string':
        if (typeof value !== 'string') throw failure('SNAPSHOT_INVALID', 'Invalid string snapshot value.');
        return value;
      case 'boolean':
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        break;
      case 'number':
        if (value !== '' && value != null && Number.isFinite(Number(value))) return Number(value);
        break;
    }
    throw failure('SNAPSHOT_INVALID', 'Unsupported snapshot scalar type.');
  }
  function schemaNodes(node, segment) {
    var result = [];
    if (!node || typeof node !== 'object') return result;
    if (node.properties && own(node.properties, segment)) result.push(node.properties[segment]);
    if (/^\d+$/.test(segment) && node.items) result.push(node.items);
    // Resolved Schema Registry documents can retain allOf compositions.
    (Array.isArray(node.allOf) ? node.allOf : []).forEach(function (part) { result = result.concat(schemaNodes(part, segment)); });
    return result;
  }
  function declared(schema, path) {
    return path.split('.').reduce(function (nodes, part) {
      return nodes.reduce(function (next, node) { return next.concat(schemaNodes(node, part)); }, []);
    }, [schema]);
  }
  function supports(schema, path, value) {
    return declared(schema, path).some(function (node) {
      var type = value === null ? 'null' : typeof value;
      var types = Array.isArray(node.type) ? node.type : [node.type];
      if (type !== 'null' && types.indexOf(type) < 0 && !(type === 'number' && types.indexOf('integer') >= 0 && Number.isInteger(value))) return false;
      if (node.enum && node.enum.indexOf(value) < 0) return false;
      if (typeof value === 'string') {
        if (node.maxLength != null && value.length > node.maxLength) return false;
        if (node.pattern && !new RegExp(node.pattern).test(value)) return false;
      }
      if (typeof value === 'number' && ((node.minimum != null && value < node.minimum) || (node.maximum != null && value > node.maximum))) return false;
      return true;
    });
  }
  function validate(input) {
    keys(input, ['sandbox', 'email', 'ecid', 'details', 'preferences', 'isNew'], 'submission');
    var sandbox = text(input.sandbox, 'sandbox');
    var email = text(input.email, 'email').toLowerCase();
    var ecid = text(input.ecid, 'ecid');
    if (!/^[a-zA-Z0-9_-]+$/.test(sandbox)) throw failure('INVALID_FORM', 'Select a sandbox.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('INVALID_FORM', 'A valid email is required.');
    if (!/^\d{10,38}$/.test(ecid)) throw failure('INVALID_FORM', 'A live ECID is required.');
    if (input.isNew !== undefined && typeof input.isNew !== 'boolean') throw failure('INVALID_FORM', 'isNew must be boolean or omitted.');
    var details = input.details == null ? {} : input.details;
    keys(details, ['firstName', 'lastName', 'dateOfBirth', 'phone', 'address'], 'details');
    var overlays = [];
    function addFields(source, paths) {
      Object.keys(source).forEach(function (key) {
        if (!own(paths, key)) return;
        var value = text(source[key], key);
        // Empty controls are not an instruction to erase an existing profile leaf.
        if (!value) return;
        if (key === 'dateOfBirth' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10))) {
          throw failure('INVALID_FORM', 'dateOfBirth must be a valid past ISO date.');
        }
        if (key === 'countryCode' && !/^[A-Z]{2}$/.test(value)) throw failure('INVALID_FORM', 'countryCode must be ISO alpha-2.');
        overlays.push({ path: paths[key], value: value, valueType: 'string' });
      });
    }
    addFields(details, detailPaths);
    if (details.address != null) {
      keys(details.address, Object.keys(addressPaths), 'address');
      addFields(details.address, addressPaths);
    }
    if (input.preferences != null) {
      keys(input.preferences, brands, 'preferences');
      Object.keys(input.preferences).forEach(function (brand) {
        keys(input.preferences[brand], channels, brand + ' preferences');
        Object.keys(input.preferences[brand]).forEach(function (channel) {
          if (typeof input.preferences[brand][channel] !== 'boolean') throw failure('INVALID_FORM', 'Preferences must be explicit booleans.');
        });
      });
    }
    return { sandbox: sandbox, email: email, ecid: ecid, isNew: input.isNew, overlays: overlays, preferences: input.preferences };
  }

  function create(options) {
    options = options || {};
    async function request(url, init, writing) {
      var fetcher = options.labAuthFetch || root.labAuthFetch || (root.AepDemoGeneratorTargets && root.AepDemoGeneratorTargets.labAuthFetch);
      if (typeof fetcher !== 'function') throw failure('AUTH_UNAVAILABLE', 'labAuthFetch is required; no unauthenticated fallback.');
      var response;
      try { response = await fetcher(url, init); }
      catch (_) { throw failure(writing ? 'WRITE_UNCERTAIN' : 'READ_FAILED', writing ? 'Profile write outcome is uncertain. Check the profile before trying again.' : 'Profile read failed; nothing was written.', writing); }
      var data;
      try { data = await response.json(); }
      catch (_) { throw failure(writing ? 'WRITE_UNCERTAIN' : 'READ_FAILED', 'Invalid profile API response.', writing && (response.status < 400 || response.status >= 500)); }
      if (!response.ok || !data || data.error || data.ok === false) {
        throw failure(writing ? 'WRITE_FAILED' : 'READ_FAILED', writing ? 'Profile inlet did not confirm acceptance.' : 'Profile read failed; nothing was written.', writing && (response.status >= 500 || response.status < 400));
      }
      return data;
    }
    async function submit(input) {
      var form = validate(input);
      var query = new URLSearchParams({ sandbox: form.sandbox, namespace: 'email', identifier: form.email, safeSnapshot: '1' });
      var table = await request('/api/profile/table?' + query, { method: 'GET', cache: 'no-store' }, false);
      if (table.safeSnapshot !== true || table.profileWriteConsentMode !== 'preserve') throw failure('SAFE_MODE_UNAVAILABLE', 'The safe profile backend must be available before writing.');
      if (typeof table.found !== 'boolean' || !Array.isArray(table.rows)) throw failure('SNAPSHOT_INVALID', 'Profile absence was not confirmed.');
      if (!table.found && table.rows.length) throw failure('SNAPSHOT_INVALID', 'Inconsistent profile absence response.');
      if (!table.found && form.isNew === false) throw failure('PROFILE_NOT_FOUND', 'Existing customer was not found; nothing was written.');
      if (table.found && form.isNew === true) throw failure('PROFILE_EXISTS', 'This email already belongs to a profile. Resume that customer instead.');
      if (table.found && (typeof table.profileEmail !== 'string' || table.profileEmail.toLowerCase() !== form.email)) throw failure('IDENTITY_MISMATCH', 'The loaded profile email does not match the submission.');
      var target = table.industries && table.industries.generic;
      if (!target || target.writable !== true || !target.schemaId || !target.datasetId || !target.xdmKey || !target.dataflowId || !/^https:\/\//.test(target.collectionUrl || '')) throw failure('NOT_WRITABLE', 'Generic profile schema and streaming connection must be ready.');
      if (!/^_[a-zA-Z0-9]+$/.test(target.xdmKey)) throw failure('SCHEMA_UNSUPPORTED', 'Unsupported profile tenant key.');
      var schemaResponse = await request('/api/schema-viewer/registry?' + new URLSearchParams({ sandbox: form.sandbox, schemaId: target.schemaId }), { method: 'GET', cache: 'no-store' }, false);
      var schema = object(schemaResponse.schema, 'schema');
      var snapshot = new Map();
      var tenantPrefix = target.xdmKey + '.';
      function put(update) {
        if (forbidden.test(update.path)) throw failure('UNSAFE_SNAPSHOT', 'Sensitive or unsafe profile paths cannot be streamed.');
        if (!supports(schema, update.path, update.value)) throw failure('SCHEMA_UNSUPPORTED', 'Schema does not support profile field: ' + update.path);
        snapshot.set(update.path, update);
      }
      if (table.found) {
        if (table.rows.some(function (row) { return !row || typeof row !== 'object'; })) throw failure('SNAPSHOT_INVALID', 'Malformed profile rows; nothing was written.');
        var genericRows = table.rows.filter(function (row) { return row.industry === 'generic' && row.writable === true; });
        if (!genericRows.length) throw failure('SNAPSHOT_INVALID', 'No full writable Generic snapshot was returned.');
        genericRows.forEach(function (row) {
          if (typeof row.path !== 'string' || !row.path) throw failure('SNAPSHOT_INVALID', 'Invalid snapshot path.');
          // Record metadata and merged identityMap are not customer-writable attributes.
          if (/^(_id|_repo(?:\.|$)|identityMap(?:\.|$))/.test(row.path)) return;
          if (row.path === tenantPrefix + 'identification.core.email' || row.path === tenantPrefix + 'identification.core.ecid') return;
          put({ path: row.path, value: scalar(row), valueType: row.valueType });
        });
      }
      form.overlays.forEach(put);
      put({ path: 'personalEmail.address', value: form.email, valueType: 'string' });
      put({ path: tenantPrefix + 'identification.core.email', value: form.email, valueType: 'string' });
      put({ path: tenantPrefix + 'identification.core.ecid', value: form.ecid, valueType: 'string' });
      var testPath = supports(schema, 'testProfile', true) ? 'testProfile' : 'xdm:testProfile';
      put({ path: testPath, value: true, valueType: 'boolean' });
      // Do not persist a stale false test-profile twin from the loaded snapshot.
      if (snapshot.has('testProfile')) snapshot.get('testProfile').value = true;
      if (snapshot.has('xdm:testProfile')) snapshot.get('xdm:testProfile').value = true;
      if (form.preferences != null) {
        Object.keys(form.preferences).forEach(function (brand) {
          Object.keys(form.preferences[brand]).forEach(function (channel) {
            var value = form.preferences[brand][channel];
            var candidates = [
              'preferences.' + brand + '.' + channel,
              'preferences.brands.' + brand + '.' + channel,
              tenantPrefix + 'preferences.' + brand + '.' + channel,
              tenantPrefix + 'preferences.brands.' + brand + '.' + channel
            ].filter(function (path) { return supports(schema, path, value); });
            if (candidates.length !== 1) throw failure('PREFERENCES_UNSUPPORTED', 'No unambiguous schema-supported brand preference for ' + brand + '/' + channel + '. Nothing was written.');
            put({ path: candidates[0], value: value, valueType: 'boolean' });
          });
        });
      }
      var result = await request('/api/profile/update?industry=generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox: form.sandbox, email: form.email, ecid: form.ecid,
          industry: 'generic', consentMode: 'preserve',
          streaming: {
            url: target.collectionUrl, flowId: target.dataflowId,
            datasetId: target.datasetId, schemaId: target.schemaId,
            xdmKey: target.xdmKey, useEnvelope: true
          },
          updates: Array.from(snapshot.values())
        })
      }, true);
      if (result.ok !== true || result.accepted !== true || result.consentMode !== 'preserve') {
        throw failure('WRITE_UNCERTAIN', 'Safe profile receipt was not confirmed. Check before trying again.', true);
      }
      return {
        accepted: true, upsVerified: false, stage: 'inlet-accepted', retrySafe: false,
        sandbox: form.sandbox, email: form.email, ecid: form.ecid,
        identity: {
          email: form.email,
          firstName: (snapshot.get('person.name.firstName') || snapshot.get(tenantPrefix + 'person.name.firstName') || {}).value || '',
          lastName: (snapshot.get('person.name.lastName') || snapshot.get(tenantPrefix + 'person.name.lastName') || {}).value || ''
        },
        isNew: !table.found, industry: 'generic',
        consentState: form.preferences != null ? 'explicit-brand-preferences' : table.found ? 'preserved' : 'unknown',
        streamingWarning: result.streamingWarning || null,
        receipt: result.receipt || { stage: 'inlet-accepted', upsVerified: false, retrySafe: false }
      };
    }
    return { submit: submit };
  }
  var api = create();
  api.create = create;
  return api;
});

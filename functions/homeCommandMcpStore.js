/**
 * Server-side (Admin SDK) CRUD over the same RTDB path the browser Command
 * Centre reads/writes: userWorkspaces/{workspaceSlug}/commandCentre/default.
 * Data shapes mirror web/profile-viewer/home-command-data.js exactly, so a
 * write from here renders identically in the browser and vice versa.
 */

const admin = require('firebase-admin');

const CUSTOMER_STATUSES = ['On track', 'At risk', 'Delayed', 'Discovery', 'UAT', 'Stalled', 'Onboarding'];

function getRtdb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
}

function stateRef(workspaceSlug) {
  return getRtdb().ref('userWorkspaces/' + workspaceSlug + '/commandCentre/default');
}

function generateId(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function emptyState() {
  return {
    version: 'v1',
    customers: [],
    tasks: [],
    meetings: [],
    activity: [],
    pocs: [],
    knowledgeBase: [],
    capacity: [],
    updatedAt: new Date().toISOString(),
  };
}

async function readState(workspaceSlug) {
  const snap = await stateRef(workspaceSlug).once('value');
  const val = snap.val();
  if (!val || typeof val !== 'object') return emptyState();
  return {
    version: 'v1',
    customers: Array.isArray(val.customers) ? val.customers : [],
    tasks: Array.isArray(val.tasks) ? val.tasks : [],
    meetings: Array.isArray(val.meetings) ? val.meetings : [],
    activity: Array.isArray(val.activity) ? val.activity : [],
    pocs: Array.isArray(val.pocs) ? val.pocs : [],
    knowledgeBase: Array.isArray(val.knowledgeBase) ? val.knowledgeBase : [],
    capacity: Array.isArray(val.capacity) ? val.capacity : [],
    updatedAt: val.updatedAt || new Date().toISOString(),
  };
}

async function writeState(workspaceSlug, state) {
  const payload = Object.assign({}, state, { version: 'v1', updatedAt: new Date().toISOString() });
  await stateRef(workspaceSlug).set(payload);
  return payload;
}

function sanitiseCustomerFields(fields) {
  const row = {};
  if (fields.name != null) row.name = String(fields.name).slice(0, 200);
  if (fields.notes != null) row.notes = String(fields.notes).slice(0, 4000);
  if (fields.drLink != null) row.drLink = String(fields.drLink).slice(0, 100);
  if (fields.status != null) {
    const status = String(fields.status);
    row.status = CUSTOMER_STATUSES.includes(status) ? status : 'Discovery';
  }
  if (fields.nextAction != null) row.nextAction = String(fields.nextAction).slice(0, 500);
  if (fields.eta != null) row.eta = String(fields.eta).slice(0, 20);
  return row;
}

async function getState(workspaceSlug) {
  const state = await readState(workspaceSlug);
  return { customers: state.customers, tasks: state.tasks, meetings: state.meetings };
}

async function addCustomer(workspaceSlug, fields) {
  const state = await readState(workspaceSlug);
  const row = Object.assign(
    { id: generateId('cust'), tags: [], productIds: [], statusStrip: 'blue', status: 'Discovery' },
    sanitiseCustomerFields(fields || {}),
  );
  if (!row.name) throw new Error('name is required');
  state.customers = state.customers.concat([row]);
  await writeState(workspaceSlug, state);
  return row;
}

async function updateCustomer(workspaceSlug, id, patch) {
  const state = await readState(workspaceSlug);
  let updated = null;
  state.customers = state.customers.map((c) => {
    if (c.id !== id) return c;
    updated = Object.assign({}, c, sanitiseCustomerFields(patch || {}));
    return updated;
  });
  if (!updated) return null;
  await writeState(workspaceSlug, state);
  return updated;
}

async function deleteCustomer(workspaceSlug, id) {
  const state = await readState(workspaceSlug);
  const before = state.customers.length;
  state.customers = state.customers.filter((c) => c.id !== id);
  if (state.customers.length === before) return false;
  await writeState(workspaceSlug, state);
  return true;
}

async function addTask(workspaceSlug, fields) {
  const state = await readState(workspaceSlug);
  const title = String((fields && fields.title) || '').slice(0, 300);
  if (!title) throw new Error('title is required');
  const row = {
    id: generateId('task'),
    title,
    customerName: String((fields && fields.customerName) || '').slice(0, 200),
    due: String((fields && fields.due) || '').slice(0, 20),
    completed: !!(fields && fields.completed),
  };
  state.tasks = state.tasks.concat([row]);
  await writeState(workspaceSlug, state);
  return row;
}

async function updateTask(workspaceSlug, id, patch) {
  const state = await readState(workspaceSlug);
  let updated = null;
  state.tasks = state.tasks.map((t) => {
    if (t.id !== id) return t;
    updated = Object.assign({}, t);
    if (patch.title != null) updated.title = String(patch.title).slice(0, 300);
    if (patch.customerName != null) updated.customerName = String(patch.customerName).slice(0, 200);
    if (patch.due != null) updated.due = String(patch.due).slice(0, 20);
    if (patch.completed != null) updated.completed = !!patch.completed;
    return updated;
  });
  if (!updated) return null;
  await writeState(workspaceSlug, state);
  return updated;
}

async function deleteTask(workspaceSlug, id) {
  const state = await readState(workspaceSlug);
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.tasks.length === before) return false;
  await writeState(workspaceSlug, state);
  return true;
}

async function addMeeting(workspaceSlug, fields) {
  const state = await readState(workspaceSlug);
  const title = String((fields && fields.title) || '').slice(0, 300);
  if (!title) throw new Error('title is required');
  const row = {
    id: generateId('mtg'),
    title,
    customerName: String((fields && fields.customerName) || '').slice(0, 200),
    at: String((fields && fields.at) || '').slice(0, 30),
    context: String((fields && fields.context) || '').slice(0, 500),
    tags: [],
  };
  state.meetings = state.meetings.concat([row]);
  await writeState(workspaceSlug, state);
  return row;
}

async function updateMeeting(workspaceSlug, id, patch) {
  const state = await readState(workspaceSlug);
  let updated = null;
  state.meetings = state.meetings.map((m) => {
    if (m.id !== id) return m;
    updated = Object.assign({}, m);
    if (patch.title != null) updated.title = String(patch.title).slice(0, 300);
    if (patch.customerName != null) updated.customerName = String(patch.customerName).slice(0, 200);
    if (patch.at != null) updated.at = String(patch.at).slice(0, 30);
    if (patch.context != null) updated.context = String(patch.context).slice(0, 500);
    return updated;
  });
  if (!updated) return null;
  await writeState(workspaceSlug, state);
  return updated;
}

async function deleteMeeting(workspaceSlug, id) {
  const state = await readState(workspaceSlug);
  const before = state.meetings.length;
  state.meetings = state.meetings.filter((m) => m.id !== id);
  if (state.meetings.length === before) return false;
  await writeState(workspaceSlug, state);
  return true;
}

module.exports = {
  CUSTOMER_STATUSES,
  getState,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addTask,
  updateTask,
  deleteTask,
  addMeeting,
  updateMeeting,
  deleteMeeting,
};

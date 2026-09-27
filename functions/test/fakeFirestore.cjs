'use strict';

// Minimal in-memory Firestore double: doc set/get, collection add, getAll, and the
// where / select / limit / get query surface used by the geo audience mirror.

function toComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return value;
}

function matches(data, { field, op, value }) {
  const actual = data[field];
  if (op === '==') return toComparable(actual) === toComparable(value);
  if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
  const a = toComparable(actual);
  const b = toComparable(value);
  if (a == null) return false;
  if (op === '>=') return a >= b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  throw new Error(`fakeFirestore does not support operator ${op}`);
}

function createFakeFirestore() {
  const store = new Map();
  const calls = { queries: [], getAll: 0, sets: 0, adds: 0 };
  let autoId = 0;

  function docRef(collection, id) {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      async set(data) {
        calls.sets += 1;
        store.set(path, { collection, id, data: { ...data } });
      },
      async get() {
        const entry = store.get(path);
        return { id, exists: Boolean(entry), data: () => (entry ? { ...entry.data } : undefined) };
      },
    };
  }

  function query(collection, filters = [], selected = null, limitN = Infinity) {
    return {
      where(field, op, value) {
        return query(collection, [...filters, { field, op, value }], selected, limitN);
      },
      select(...fields) {
        return query(collection, filters, fields, limitN);
      },
      limit(n) {
        return query(collection, filters, selected, n);
      },
      async get() {
        calls.queries.push({ collection, filters, selected, limit: limitN });
        const docs = [...store.values()]
          .filter((entry) => entry.collection === collection)
          .filter((entry) => filters.every((f) => matches(entry.data, f)))
          .slice(0, limitN)
          .map((entry) => {
            const data = selected
              ? Object.fromEntries(selected.map((k) => [k, entry.data[k]]))
              : { ...entry.data };
            return { id: entry.id, data: () => data };
          });
        return { size: docs.length, empty: docs.length === 0, docs };
      },
    };
  }

  const db = {
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        async add(data) {
          calls.adds += 1;
          autoId += 1;
          const id = `auto-${autoId}`;
          store.set(`${name}/${id}`, { collection: name, id, data: { ...data } });
          return docRef(name, id);
        },
        ...query(name),
      };
    },
    async getAll(...refs) {
      calls.getAll += 1;
      return Promise.all(refs.map((ref) => ref.get()));
    },
  };

  return { db, store, calls };
}

module.exports = { createFakeFirestore };

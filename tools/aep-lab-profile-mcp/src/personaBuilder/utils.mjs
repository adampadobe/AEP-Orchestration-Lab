/** Shared randomization helpers for persona builders. */

export const BIRTH_AGE_MIN = 18;
export const BIRTH_AGE_MAX = 85;

export function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function randomPick(arr) {
  if (!arr?.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomPickN(arr, n) {
  if (n <= 0 || !arr?.length) return [];
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < Math.min(n, copy.length); i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

export function weightedBool(probability) {
  return Math.random() < probability;
}

export function weightedPick(dist) {
  const r = Math.random();
  let acc = 0;
  for (const [key, weight] of Object.entries(dist)) {
    acc += weight;
    if (r < acc) return key;
  }
  const keys = Object.keys(dist);
  return keys[keys.length - 1] || '';
}

export function pickByWeight(items) {
  let total = 0;
  items.forEach((item) => { total += item.weight; });
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    const w = items[i].weight;
    if (r < w) return items[i];
    r -= w;
  }
  return items[items.length - 1];
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function randomBirthDateIso() {
  const now = new Date();
  const year = now.getFullYear() - randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX);
  const month = randomBetween(1, 12);
  const day = randomBetween(1, 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function computeAgeFromBirthDate(isoStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoStr || '').trim());
  if (!m) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  const today = new Date();
  let age = today.getFullYear() - by;
  const beforeBirthday =
    today.getMonth() + 1 < bm || (today.getMonth() + 1 === bm && today.getDate() < bd);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function isoDateAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function isoDateInFuture(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function isoDateFromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function randomDecimal(min, max, decimals = 2) {
  const v = min + Math.random() * (max - min);
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}

export function randomBellBetween(min, max, mid) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const spread = (max - min) / 6;
  const v = mid + z * spread;
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** @param {Record<string, unknown>} attrs */
export function assign(attrs, path, value) {
  if (value === undefined || value === null || value === '') return;
  attrs[path] = value;
}
